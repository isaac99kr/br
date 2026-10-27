#!/usr/bin/env python3
"""Build an immutable local chapter release. Does not upload or deploy."""
import argparse
import json
from pathlib import Path
import shutil
from chapter_sources import ROOT, load_chapter
from generate_chapter import atomic_json, digest, read_json, sha256
from generate_chapters import connect, intact


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--output',type=Path,default=ROOT/'tts/work/releases')
    p.add_argument('--preview',action='store_true',help='Allow automatically validated but not listening-reviewed chapters for local preview')
    args=p.parse_args()
    output=args.output.resolve()
    db=connect()
    selected={}
    for row in db.execute("SELECT * FROM jobs WHERE state IN ('validated','reviewed','published') ORDER BY updated"):
        if not args.preview and row['state'] not in ['reviewed','published']:
            continue
        if not intact(row['directory']):
            continue
        directory=Path(row['directory'])
        timing=next(directory.glob('*_[0-9][0-9][0-9].json'))
        meta=read_json(timing)
        _,entries=load_chapter(row['translation'],row['book'],row['chapter'])
        if digest(entries)!=meta['sourceSha256']:
            continue
        key=(meta['translationId'],meta['book'],meta['chapter'])
        selected[key]=(directory,timing,meta)
    if not selected:
        raise SystemExit('배포할 검증/검수 완료 장이 없습니다. 로컬 미리보기에는 --preview를 사용하세요.')
    profiles={digest({k: v[2][k] for k in ['engine','speaker','speed','totalSteps','modelRevision','styleSha256','sdkOrigin']}) for v in selected.values()}
    if len(profiles)!=1:
        raise SystemExit('서로 다른 합성 프로필이 섞여 있습니다. 대상 프로필을 정리하세요.')
    release_id=digest({'preview':args.preview,'assets':[{'key':k,'audio':v[2]['audioSha256'],'timing':sha256(v[1])} for k,v in sorted(selected.items())]})[:20]
    release=output/release_id
    release.mkdir(parents=True,exist_ok=True)
    manifest={'schemaVersion':1,'releaseId':release_id,'preview':args.preview,'chapters':[]}
    for (translation,book,chapter),(directory,timing,meta) in sorted(selected.items()):
        relative=Path(translation)/book/f'{chapter:03d}'
        destination=release/relative
        destination.mkdir(parents=True,exist_ok=True)
        # Preserve JSON audio basename; URL mapping belongs to the manifest.
        for source in [directory/meta['audio'],timing]:
            target=destination/source.name
            temp=target.with_suffix(target.suffix+'.tmp')
            shutil.copyfile(source,temp)
            if sha256(temp)!=sha256(source):
                raise RuntimeError('복사 중 해시 불일치')
            temp.replace(target)
        manifest['chapters'].append({'translationId':translation,'book':book,'abbr':meta['abbr'],
            'chapter':chapter,'audioUrl':str(relative/meta['audio']),'timingUrl':str(relative/timing.name),
            'audioSha256':meta['audioSha256'],'timingSha256':sha256(timing),
            'generationHash':meta['generationHash'],'durationMs':meta['durationMs'],
            'bytes':(directory/meta['audio']).stat().st_size,'verseNumbers':[v['verse'] for v in meta['verses']]})
    target=release/'manifest.json'
    if target.exists() and read_json(target)!=manifest:
        raise RuntimeError('불변 릴리스 충돌')
    atomic_json(target,manifest)
    if (output/'current.json').exists():
        atomic_json(output/'previous.json',read_json(output/'current.json'))
    atomic_json(output/'current.json',{'schemaVersion':1,'releaseId':release_id,'manifest':f'{release_id}/manifest.json'})
    print(json.dumps({'release':str(release),'chapters':len(selected),'preview':args.preview},ensure_ascii=False))


if __name__=='__main__':
    main()
