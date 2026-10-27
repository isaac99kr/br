#!/usr/bin/env python3
"""Record human listening reviews or prune reproducible WAVs after verified backup."""
import argparse
import fcntl
import json
from pathlib import Path
import time
from generate_chapters import WORK, connect, intact
from generate_chapter import atomic_json, read_json, sha256


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--directory',type=Path,required=True,help='Exact generation directory')
    p.add_argument('--review-note',help='Record actual human listening observations; never auto-pass')
    p.add_argument('--backup-dir',type=Path,help='Existing independent backup containing MP3, timing JSON, config and validation')
    p.add_argument('--prune',choices=['joined','all-wav'])
    p.add_argument('--apply',action='store_true',help='Without this, list files only')
    args=p.parse_args()
    directory=args.directory.resolve()
    if not directory.is_relative_to((WORK.parent/'chapters').resolve()) or not intact(directory):
        p.error('검증된 장 생성 폴더를 지정하세요.')
    with (WORK/'worker.lock').open('a+') as lock:
        fcntl.flock(lock.fileno(),fcntl.LOCK_EX|fcntl.LOCK_NB)
        with (directory/'.lock').open('a+') as chapter_lock:
            fcntl.flock(chapter_lock.fileno(),fcntl.LOCK_EX|fcntl.LOCK_NB)
            db=connect()
            rows=db.execute('SELECT id FROM jobs WHERE directory=?',(str(directory),)).fetchall()
            if not rows:
                p.error('배치 상태에 등록되지 않은 장입니다.')
            if args.review_note:
                atomic_json(directory/'listening-review.json',{'reviewedAt':time.time(),'note':args.review_note,
                            'timingSha256':read_json(directory/'validation.json')['timingSha256']})
                db.execute("UPDATE jobs SET state='reviewed',updated=? WHERE directory=?",(time.time(),str(directory)))
                db.commit()
                print('청취 검수 기록 저장')
            if not args.prune:
                return
            files=[directory/'chapter.wav']
            if args.prune=='all-wav':
                if not args.backup_dir or args.backup_dir.resolve()==directory:
                    p.error('전체 WAV 정리에는 별도의 검증된 백업 경로가 필요합니다.')
                review=read_json(directory/'listening-review.json')
                if review['timingSha256']!=read_json(directory/'validation.json')['timingSha256']:
                    p.error('현재 파일의 청취 검수가 필요합니다.')
                config=read_json(directory/'generation-config.json')
                for path in directory.iterdir():
                    if path.suffix in ['.json','.mp3']:
                        if not (args.backup_dir/path.name).is_file() or sha256(path)!=sha256(args.backup_dir/path.name):
                            p.error(f'백업 누락/해시 불일치: {path.name}')
                parts=directory.parent/('parts-'+config['conditions']['synthesisHash'][:16])
                files+=list(parts.glob('*.wav'))+list(directory.glob('preview-*.wav'))
            files=[p for p in files if p.exists()]
            print(json.dumps({'apply':args.apply,'bytes':sum(p.stat().st_size for p in files),'files':[str(p) for p in files]},ensure_ascii=False,indent=2))
            if args.apply:
                for path in files:
                    path.unlink()
                atomic_json(directory/'pruning.json',{'at':time.time(),'kind':args.prune,'files':[str(p) for p in files]})


if __name__=='__main__':
    main()
