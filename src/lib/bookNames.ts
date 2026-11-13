const BOOK_NAMES: Record<string, string> = {
  창: '창세기',
  출: '출애굽기',
  레: '레위기',
  민: '민수기',
  신: '신명기',
  수: '여호수아',
  삿: '사사기',
  룻: '룻기',
  삼상: '사무엘상',
  삼하: '사무엘하',
  왕상: '열왕기상',
  왕하: '열왕기하',
  대상: '역대상',
  대하: '역대하',
  스: '에스라',
  라: '에스라',
  느: '느헤미야',
  에: '에스더',
  욥: '욥기',
  시: '시편',
  잠: '잠언',
  전: '전도서',
  아: '아가',
  사: '이사야',
  렘: '예레미야',
  애: '예레미야애가',
  겔: '에스겔',
  단: '다니엘',
  호: '호세아',
  욜: '요엘',
  암: '아모스',
  옵: '오바댜',
  욘: '요나',
  미: '미가',
  나: '나훔',
  나훔: '나훔',
  합: '하박국',
  습: '스바냐',
  스바냐: '스바냐',
  학: '학개',
  슥: '스가랴',
  말: '말라기',
  마: '마태복음',
  막: '마가복음',
  눅: '누가복음',
  요: '요한복음',
  행: '사도행전',
  롬: '로마서',
  고전: '고린도전서',
  고후: '고린도후서',
  갈: '갈라디아서',
  엡: '에베소서',
  빌: '빌립보서',
  골: '골로새서',
  살전: '데살로니가전서',
  살후: '데살로니가후서',
  딤전: '디모데전서',
  딤후: '디모데후서',
  딛: '디도서',
  몬: '빌레몬서',
  히: '히브리서',
  약: '야고보서',
  벧전: '베드로전서',
  벧후: '베드로후서',
  요일: '요한일서',
  요이: '요한이서',
  요삼: '요한삼서',
  유: '유다서',
  계: '요한계시록',
}

// 숫자·서수 표기. "요1장"은 요한복음 1장이라 여기 넣지 않는다.
const NUMBERED_EPISTLE_ALIASES: Record<string, string> = {
  요1서: '요일',
  요2서: '요이',
  요3서: '요삼',
  요한1서: '요일',
  요한2서: '요이',
  요한3서: '요삼',
  요한첫째서: '요일',
  요한둘째서: '요이',
  요한셋째서: '요삼',
  요한일: '요일',
  요한이: '요이',
  요한삼: '요삼',
  '1요한서': '요일',
  '2요한서': '요이',
  '3요한서': '요삼',
  '1요한': '요일',
  '2요한': '요이',
  '3요한': '요삼',
  '1요': '요일',
  '2요': '요이',
  '3요': '요삼',
}

export function getBookName(abbr: string): string {
  return BOOK_NAMES[abbr] ?? abbr
}

export function getBookAbbr(name: string): string {
  return Object.entries(BOOK_NAMES).find(([abbr, full]) => name === abbr || name === full)?.[0] ?? name
}

const BOOK_ALIASES: { alias: string; abbr: string }[] = (() => {
  const list: { alias: string; abbr: string }[] = []
  const seen = new Set<string>()
  const add = (alias: string, abbr: string) => {
    if (!alias || seen.has(alias)) return
    seen.add(alias)
    list.push({ alias, abbr })
  }
  for (const [abbr, full] of Object.entries(BOOK_NAMES)) {
    add(abbr, abbr)
    if (full !== abbr) add(full, getBookAbbr(full))
  }
  for (const [alias, abbr] of Object.entries(NUMBERED_EPISTLE_ALIASES)) add(alias, abbr)
  list.sort((a, b) => b.alias.length - a.alias.length)
  return list
})()

/** Longest book name at the start of a normalized reference. Rest is the chapter/verse spec. */
export function matchBookAlias(part: string): { abbr: string; rest: string } | null {
  for (const { alias, abbr } of BOOK_ALIASES) {
    if (!part.startsWith(alias)) continue
    const rest = part.slice(alias.length)
    if (rest === '' || /^[0-9]/.test(rest)) return { abbr, rest }
  }
  return null
}
