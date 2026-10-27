#!/usr/bin/env python3
"""Detached, resumable supervisor: one 20-chapter/60-minute session at a time."""
import argparse
import fcntl
import json
import os
from pathlib import Path
import subprocess
import sys
import time
from chapter_sources import ROOT
from generate_chapter import atomic_json
from generate_chapters import WORK

STATE=WORK/'supervisor.json'


def command(translation, *options):
    return [sys.executable,str(ROOT/'tts/scripts/generate_chapters.py'),'--translation',translation,*options]


def status(translation):
    return json.loads(subprocess.check_output(command(translation,'--status'),cwd=ROOT))


def worker():
    with (WORK/'supervisor.lock').open('a+') as lock:
        fcntl.flock(lock.fileno(),fcntl.LOCK_EX|fcntl.LOCK_NB)
        info={'pid':os.getpid(),'started':time.time(),'state':'running','sessions':0}
        atomic_json(STATE,info)
        wake=subprocess.Popen(['caffeinate','-i','-w',str(os.getpid())]) if sys.platform=='darwin' else None
        try:
            for translation in ['krv','rnksv']:
                while not (WORK/'STOP').exists():
                    before=status(translation)
                    if before['remaining']==0:
                        break
                    info.update(translation=translation,progress=before)
                    atomic_json(STATE,info)
                    code=subprocess.call(command(translation,'--max-chapters','20','--max-minutes','60','--threads','2'),cwd=ROOT)
                    info['sessions']+=1
                    info['progress']=status(translation)
                    atomic_json(STATE,info)
                    if code:
                        raise RuntimeError(f'{translation} 배치 실패: 장별 로그 확인 후 재시작 필요')
                    if info['progress']['remaining']>=before['remaining'] and not (WORK/'STOP').exists():
                        raise RuntimeError('진행된 장이 없어 반복 실행을 중단합니다.')
                if (WORK/'STOP').exists():
                    info['state']='stopped'
                    break
            else:
                info['state']='generated'
            info['finished']=time.time()
        except BaseException as error:
            info.update(state='failed',error=str(error),finished=time.time())
            raise
        finally:
            atomic_json(STATE,info)
            if wake:
                wake.terminate()


def main():
    p=argparse.ArgumentParser(description=__doc__)
    mode=p.add_mutually_exclusive_group(required=True)
    mode.add_argument('--start',action='store_true')
    mode.add_argument('--stop',action='store_true')
    mode.add_argument('--status',action='store_true')
    mode.add_argument('--worker',action='store_true',help=argparse.SUPPRESS)
    args=p.parse_args()
    WORK.mkdir(parents=True,exist_ok=True)
    if args.worker:
        worker()
    elif args.stop:
        (WORK/'STOP').touch()
        print('현재 장 검증 후 중단 요청됨. --start로 이어서 실행합니다.')
    elif args.status:
        running=False
        with (WORK/'supervisor.lock').open('a+') as lock:
            try:
                fcntl.flock(lock.fileno(),fcntl.LOCK_EX|fcntl.LOCK_NB)
            except BlockingIOError:
                running=True
        print(json.dumps({'running':running,'lastRun':json.loads(STATE.read_text()) if STATE.exists() else None,
                          'translations':{t:status(t) for t in ['krv','rnksv']}},ensure_ascii=False,indent=2))
    else:
        # Serialize starts so two UI/terminal invocations cannot spawn two workers.
        with (WORK/'start.lock').open('a+') as start_lock:
            fcntl.flock(start_lock.fileno(),fcntl.LOCK_EX)
            with (WORK/'supervisor.lock').open('a+') as lock:
                try:
                    fcntl.flock(lock.fileno(),fcntl.LOCK_EX|fcntl.LOCK_NB)
                except BlockingIOError:
                    raise SystemExit('이미 전체 생성이 실행 중입니다.')
            with (WORK/'worker.lock').open('a+') as batch_lock:
                try:
                    fcntl.flock(batch_lock.fileno(),fcntl.LOCK_EX|fcntl.LOCK_NB)
                except BlockingIOError:
                    raise SystemExit('개별 배치가 실행 중입니다. 완료 후 전체 생성을 시작하세요.')
            (WORK/'STOP').unlink(missing_ok=True)
            with (WORK/'full-bible.log').open('a') as log:
                child=subprocess.Popen([sys.executable,str(Path(__file__).resolve()),'--worker'],
                    cwd=ROOT,stdin=subprocess.DEVNULL,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
            for _ in range(50):
                if child.poll() is not None:
                    raise SystemExit('실행 실패: tts/work/batches/full-bible.log 확인')
                if STATE.exists() and json.loads(STATE.read_text()).get('pid')==child.pid:
                    print(f'전체 순차 생성 시작 PID={child.pid}; 로그: {WORK / "full-bible.log"}')
                    return
                time.sleep(0.1)
            raise SystemExit('시작 확인 시간 초과: 상태 명령으로 확인하세요.')


if __name__=='__main__':
    main()
