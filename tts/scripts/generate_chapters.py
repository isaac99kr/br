#!/usr/bin/env python3
"""Serial chapter batches with durable SQLite state and bounded sessions."""
import argparse
from contextlib import contextmanager
import fcntl
import importlib.metadata as metadata
import json
import os
from pathlib import Path
import shutil
import signal
import sqlite3
import subprocess
import sys
import time
import uuid

from chapter_sources import ROOT, TEXT_VERSION, load_chapter
from generate_chapter import BOOK_ABBRS, LOGIC_VERSION, atomic_json, digest, read_json, sha256
from download_chapter_model import MODEL_DIR

WORK = ROOT / 'tts/work/batches'
PILOT = {'krv': [('창',1),('창',2),('시',23),('시',119),('요',1),('요',3),('행',8),('행',20),('롬',1),('계',22)],
         'rnksv': [('창',1),('시',119),('행',20)]}


def connect(path=None):
    WORK.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(path or WORK/'state.sqlite')
    db.row_factory = sqlite3.Row
    db.execute('PRAGMA journal_mode=WAL')
    db.execute('''CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY, translation TEXT, book TEXT, chapter INTEGER, profile TEXT,
        state TEXT DEFAULT 'pending', attempts INTEGER DEFAULT 0, directory TEXT,
        seconds REAL, error TEXT, updated REAL, run_id TEXT)''')
    db.execute('''CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, started REAL, finished REAL, summary TEXT)''')
    db.commit()
    return db


def intact(directory):
    try:
        path = Path(directory)
        report = read_json(path/'validation.json')
        config = read_json(path/'generation-config.json')
        meta_path = next(path.glob('*_[0-9][0-9][0-9].json'))
        meta = read_json(meta_path)
        return (report['passed'] and sha256(meta_path) == report['timingSha256']
                and digest(config['conditions']) == meta['generationHash'] == config['generationHash'] == report['generationHash']
                and sha256(path/meta['audio']) == report['audioSha256'] == meta['audioSha256'])
    except (OSError, ValueError, KeyError, StopIteration, TypeError):
        return False


def register(db, args):
    cfg = read_json(ROOT/'tts/config/voice-selection.json')
    profile = digest({'config': cfg, 'style': sha256(ROOT/'tts'/cfg['female']['stylePath']),
                      'model': read_json(MODEL_DIR/'model-manifest.json'), 'logic': LOGIC_VERSION,
                      'text': TEXT_VERSION, 'threads': args.threads,
                      'python': sys.version, 'packages': {n: metadata.version(n) for n in ['supertonic','numpy','onnxruntime','soundfile']}})
    order = [BOOK_ABBRS[0]] + BOOK_ABBRS[39:] + BOOK_ABBRS[1:39]
    book_filter = args.books.split(',') if args.books else order
    if not set(book_filter) <= set(order):
        raise ValueError('알 수 없는 책 약어')
    chapter_filter = None
    if args.chapters:
        if not args.books:
            raise ValueError('--chapters는 --books와 함께 사용하세요.')
        chapter_filter = set()
        for token in args.chapters.split(','):
            ends = token.split('-')
            a, b = int(ends[0]), int(ends[-1])
            if a < 1 or b < a:
                raise ValueError('잘못된 장 범위')
            chapter_filter.update(range(a,b+1))
    selected = []
    for book in book_filter:
        data = read_json(ROOT/'public/data/bible'/args.translation/f'{book}.json')
        if chapter_filter and not chapter_filter <= set(map(int,data['chapters'])):
            raise ValueError(f'{book}: 존재하지 않는 장')
        for chapter in sorted(map(int,data['chapters'])):
            if chapter_filter and chapter not in chapter_filter:
                continue
            if args.pilot and (book,chapter) not in PILOT[args.translation]:
                continue
            _, entries = load_chapter(args.translation,book,chapter)
            key = digest({'profile':profile,'translation':args.translation,'book':book,'chapter':chapter,'entries':entries})
            db.execute('INSERT OR IGNORE INTO jobs(id,translation,book,chapter,profile,updated) VALUES(?,?,?,?,?,?)',
                       (key,args.translation,book,chapter,profile,time.time()))
            selected.append(key)
    db.commit()
    return selected


def execute(db, args, ids):
    run_id = time.strftime('%Y%m%d-%H%M%S')+'-'+uuid.uuid4().hex[:6]
    run_dir = WORK/run_id
    run_dir.mkdir()
    db.execute('INSERT INTO runs(id,started) VALUES(?,?)',(run_id,time.time()))
    db.commit()
    start = time.monotonic()
    done = failures = consecutive = 0
    attempted = []
    child = None
    def interrupt(signum, frame):
        if child and child.poll() is None:
            child.send_signal(signal.SIGINT)
        raise KeyboardInterrupt
    signal.signal(signal.SIGTERM,interrupt)
    signal.signal(signal.SIGINT,interrupt)
    try:
        for key in ids:
            job = dict(db.execute('SELECT * FROM jobs WHERE id=?',(key,)).fetchone())
            if args.retry_failed and job['state'] != 'failed':
                continue
            if not args.force and job['state'] in ['validated','reviewed','published'] and intact(job['directory']):
                continue
            if (done+failures >= args.max_chapters or time.monotonic()-start >= args.max_minutes*60
                    or (WORK/'STOP').exists()):
                break
            if shutil.disk_usage(ROOT).free < args.min_free_gb*1024**3:
                raise RuntimeError('디스크 여유 부족: 새 장을 시작하지 않습니다.')
            db.execute("UPDATE jobs SET state='running',attempts=attempts+1,updated=?,run_id=?,error=NULL WHERE id=?",(time.time(),run_id,key))
            db.commit()
            result_path = run_dir/f'{key}.json'
            log_path = run_dir/f'{job["translation"]}-{job["book"]}-{job["chapter"]:03d}.log'
            command=[sys.executable,str(ROOT/'tts/scripts/generate_chapter.py'),'--translation',job['translation'],
                     '--book',job['book'],'--chapter',str(job['chapter']),'--threads',str(args.threads),
                     '--result-file',str(result_path)]
            if args.force:
                command.append('--force')
            print(f'{job["translation"]} {job["book"]}{job["chapter"]}: 시작 → {log_path}',flush=True)
            before=time.monotonic()
            with log_path.open('w') as log:
                child=subprocess.Popen(command,stdout=log,stderr=subprocess.STDOUT,cwd=ROOT)
                code=child.wait()
            child=None
            seconds=time.monotonic()-before
            result=read_json(result_path) if code==0 and result_path.exists() else {}
            success=code==0 and intact(result.get('directory'))
            error=None if success else log_path.read_text()[-4000:]
            db.execute('UPDATE jobs SET state=?,directory=?,seconds=?,error=?,updated=? WHERE id=?',
                       ('validated' if success else 'failed',result.get('directory'),seconds,error,time.time(),key))
            db.commit()
            attempted.append({'book':job['book'],'chapter':job['chapter'],'success':success,'seconds':round(seconds,2)})
            if success:
                done+=1; consecutive=0
            else:
                failures+=1; consecutive+=1
            print(f'{"완료" if success else "실패"}: {job["book"]}{job["chapter"]} ({seconds:.1f}s)',flush=True)
            if consecutive>=3 or (error and any(x in error for x in ['모델 손상','No space left','model-manifest.json'])):
                break
    finally:
        if child is not None:
            child.wait()
        db.execute("UPDATE jobs SET state='pending',error='중단됨: 다음 실행에서 중간 파일 재검증' WHERE state='running' AND run_id=?",(run_id,))
        summary={'runId':run_id,'validated':done,'failed':failures,'seconds':round(time.monotonic()-start,2),
                 'attempted':attempted,'listeningReviewed':False,'freeBytes':shutil.disk_usage(ROOT).free}
        atomic_json(run_dir/'summary.json',summary)
        db.execute('UPDATE runs SET finished=?,summary=? WHERE id=?',(time.time(),json.dumps(summary),run_id))
        db.commit()
        print(json.dumps(summary,ensure_ascii=False),flush=True)
    if failures:
        raise SystemExit(1)


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--translation',choices=['krv','rnksv'],default='krv')
    p.add_argument('--books');p.add_argument('--chapters')
    p.add_argument('--threads',type=int,default=2)
    p.add_argument('--max-chapters',type=int,default=20)
    p.add_argument('--max-minutes',type=float,default=60)
    p.add_argument('--min-free-gb',type=float,default=10)
    for flag in ['dry-run','status','retry-failed','force','pilot']:
        p.add_argument('--'+flag,action='store_true')
    args=p.parse_args()
    if min(args.threads,args.max_chapters,args.max_minutes,args.min_free_gb)<=0:
        p.error('제한값은 양수여야 합니다.')
    if args.force and not (args.books and args.chapters):
        p.error('--force에는 --books와 --chapters를 명시해야 합니다.')
    db=connect()
    with (WORK/'worker.lock').open('a+') as lock:
        if not (args.status or args.dry_run):
            fcntl.flock(lock.fileno(),fcntl.LOCK_EX | fcntl.LOCK_NB)
            # Holding the worker lock proves any prior running rows are stale.
            db.execute("UPDATE jobs SET state='pending',error='이전 실행 종료: 재개 대기' WHERE state='running'")
            db.commit()
        ids=register(db,args)
        jobs=[dict(db.execute('SELECT * FROM jobs WHERE id=?',(key,)).fetchone()) for key in ids]
        if args.status or args.dry_run:
            counts={state:sum(j['state']==state for j in jobs) for state in ['pending','running','validated','reviewed','published','failed']}
            durations=[j['seconds'] for j in jobs if j['state']=='validated' and j['seconds']]
            print(json.dumps({'selected':len(ids),'counts':counts,'remaining':sum(j['state'] not in ['validated','reviewed','published'] for j in jobs),
                              'meanMeasuredSeconds':sum(durations)/len(durations) if durations else None,
                              'freeBytes':shutil.disk_usage(ROOT).free},ensure_ascii=False,indent=2))
            if args.dry_run:
                print(' '.join(f'{j["book"]}{j["chapter"]}({j["state"]})' for j in jobs))
        else:
            execute(db,args,ids)


if __name__=='__main__':
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(130)
