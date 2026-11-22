export type PartOfSpeech = 'noun' | 'verb' | 'adjective' | 'adverb' | 'expression';

export interface VocabularySense {
  readonly id: string;
  readonly language: string;
  readonly sourceLanguage: string;
  readonly lemma: string;
  readonly gloss: string;
  readonly partOfSpeech: PartOfSpeech;
  readonly examples: readonly { readonly target: string; readonly source: string }[];
  /** Reference forms for semantic grading; never an exhaustive answer whitelist. */
  readonly acceptedForms: readonly string[];
  readonly rank: number;
  readonly level: 'beginner';
  readonly tags: readonly string[];
  readonly notes?: string;
}

export interface LanguagePack {
  readonly id: string;
  readonly version: string;
  readonly language: string;
  /** Unicode script identifier used for native-script answer-policy checks. */
  readonly targetScript: string;
  readonly sourceLanguage: string;
  readonly reviewStatus: 'draft-needs-pedagogical-review';
  readonly provenance: string;
  readonly senses: readonly VocabularySense[];
}

type Seed = readonly [
  slug: string, lemma: string, gloss: string, partOfSpeech: PartOfSpeech,
  target: string, source: string, topic: string, forms?: readonly string[], notes?: string,
];

// Original project-authored examples. Review by a Korean educator is required before alpha release.
const koreanSeeds: readonly Seed[] = [
  ['water', '물', 'water', 'noun', '물을 마셔요.', 'I drink water.', 'food'],
  ['cooked-rice', '밥', 'cooked rice', 'noun', '밥을 먹어요.', 'I eat rice.', 'food', [], 'Also used for a meal; this sense targets cooked rice.'],
  ['coffee', '커피', 'coffee', 'noun', '커피를 마셔요.', 'I drink coffee.', 'food'],
  ['tea', '차', 'tea', 'noun', '따뜻한 차를 마셔요.', 'I drink warm tea.', 'food', [], 'Use the beverage sense, not the homonymous word for a car.'],
  ['bread', '빵', 'bread', 'noun', '빵을 사요.', 'I buy bread.', 'food'],
  ['apple', '사과', 'apple', 'noun', '사과를 먹어요.', 'I eat an apple.', 'food', [], 'Use the fruit sense, not apology.'],
  ['milk', '우유', 'milk', 'noun', '우유가 있어요.', 'There is milk.', 'food'],
  ['home', '집', 'home; house', 'noun', '집에 가요.', 'I go home.', 'places'],
  ['school', '학교', 'school', 'noun', '학교에 가요.', 'I go to school.', 'places'],
  ['company', '회사', 'company; workplace', 'noun', '회사에서 일해요.', 'I work at the company.', 'places'],
  ['restaurant', '식당', 'restaurant', 'noun', '식당에서 밥을 먹어요.', 'I eat a meal at a restaurant.', 'places'],
  ['cafe', '카페', 'café', 'noun', '카페에서 친구를 만나요.', 'I meet a friend at a café.', 'places'],
  ['store', '가게', 'shop; store', 'noun', '가게에서 빵을 사요.', 'I buy bread at a shop.', 'places'],
  ['park', '공원', 'park', 'noun', '공원에서 걸어요.', 'I walk in the park.', 'places'],
  ['friend', '친구', 'friend', 'noun', '친구를 만나요.', 'I meet a friend.', 'people'],
  ['family', '가족', 'family', 'noun', '가족과 같이 먹어요.', 'I eat with my family.', 'people'],
  ['person', '사람', 'person', 'noun', '사람이 많아요.', 'There are many people.', 'people'],
  ['name', '이름', 'name', 'noun', '이름이 뭐예요?', 'What is your name?', 'people'],
  ['book', '책', 'book', 'noun', '책을 읽어요.', 'I read a book.', 'daily-life'],
  ['bag', '가방', 'bag', 'noun', '가방이 작아요.', 'The bag is small.', 'daily-life'],
  ['phone', '전화', 'telephone; phone call', 'noun', '전화를 해요.', 'I make a phone call.', 'daily-life'],
  ['time', '시간', 'time', 'noun', '시간이 있어요.', 'I have time.', 'time'],
  ['today', '오늘', 'today', 'noun', '오늘은 쉬어요.', 'I rest today.', 'time'],
  ['tomorrow', '내일', 'tomorrow', 'noun', '내일 만나요.', 'See you tomorrow.', 'time'],
  ['yesterday', '어제', 'yesterday', 'noun', '어제 친구를 만났어요.', 'I met a friend yesterday.', 'time'],
  ['now', '지금', 'now', 'adverb', '지금 공부해요.', 'I am studying now.', 'time'],
  ['go', '가다', 'to go', 'verb', '공원에 가요.', 'I go to the park.', 'actions', ['가요', '가']],
  ['come', '오다', 'to come', 'verb', '친구가 와요.', 'A friend is coming.', 'actions', ['와요', '와']],
  ['eat', '먹다', 'to eat', 'verb', '빵을 먹어요.', 'I eat bread.', 'actions', ['먹어요', '먹어']],
  ['drink', '마시다', 'to drink', 'verb', '물을 마셔요.', 'I drink water.', 'actions', ['마셔요', '마셔']],
  ['see', '보다', 'to see; to watch', 'verb', '영화를 봐요.', 'I watch a movie.', 'actions', ['봐요', '봐']],
  ['read', '읽다', 'to read', 'verb', '집에서 책을 읽어요.', 'I read a book at home.', 'actions', ['읽어요', '읽어']],
  ['buy', '사다', 'to buy', 'verb', '사과를 사요.', 'I buy apples.', 'actions', ['사요', '사']],
  ['meet', '만나다', 'to meet', 'verb', '내일 친구를 만나요.', 'I meet a friend tomorrow.', 'actions', ['만나요', '만나']],
  ['study', '공부하다', 'to study', 'verb', '한국어를 공부해요.', 'I study Korean.', 'actions', ['공부해요', '공부해']],
  ['work', '일하다', 'to work', 'verb', '오늘 일해요.', 'I work today.', 'actions', ['일해요', '일해']],
  ['rest', '쉬다', 'to rest', 'verb', '집에서 쉬어요.', 'I rest at home.', 'actions', ['쉬어요', '쉬어']],
  ['sleep', '자다', 'to sleep', 'verb', '잘 자요.', 'Sleep well.', 'actions', ['자요', '자']],
  ['like', '좋아하다', 'to like', 'verb', '커피를 좋아해요.', 'I like coffee.', 'preferences', ['좋아해요', '좋아해'], 'Distinguish liking something from 좋다, being good.'],
  ['good', '좋다', 'to be good', 'adjective', '날씨가 좋아요.', 'The weather is good.', 'descriptions', ['좋아요', '좋아']],
  ['big', '크다', 'to be big', 'adjective', '집이 커요.', 'The house is big.', 'descriptions', ['커요', '커']],
  ['small', '작다', 'to be small', 'adjective', '가방이 작아요.', 'The bag is small.', 'descriptions', ['작아요', '작아']],
  ['delicious', '맛있다', 'to be delicious', 'adjective', '빵이 맛있어요.', 'The bread is delicious.', 'descriptions', ['맛있어요', '맛있어']],
  ['busy', '바쁘다', 'to be busy', 'adjective', '오늘은 바빠요.', 'I am busy today.', 'descriptions', ['바빠요', '바빠']],
  ['together', '같이', 'together', 'adverb', '같이 가요.', 'Let us go together.', 'daily-life', ['함께']],
  ['hello', '안녕하세요', 'hello (polite greeting)', 'expression', '안녕하세요, 저는 민지예요.', 'Hello, I am Minji.', 'greetings', [], 'Polite greeting; 안녕 is informal and not equivalent in a prompt requiring polite speech.'],
  ['thanks', '감사합니다', 'thank you (polite)', 'expression', '도와주셔서 감사합니다.', 'Thank you for helping me.', 'greetings', ['고맙습니다', '고마워요'], 'These polite alternatives differ in register; follow the prompt context.'],
  ['sorry', '미안해요', 'I am sorry (polite)', 'expression', '늦어서 미안해요.', 'I am sorry I am late.', 'greetings', ['죄송해요', '죄송합니다']],
  ['please-give', '주세요', 'please give me', 'expression', '물 주세요.', 'Please give me water.', 'food', [], 'A polite request ending, not a standalone equivalent for every use of English please.'],
  ['okay', '괜찮아요', 'it is okay; I am okay', 'expression', '저는 괜찮아요.', 'I am okay.', 'daily-life', ['괜찮습니다']],
];

export const koreanStarterPack: LanguagePack = {
  id: 'ko-en-everyday-v1',
  version: '1.0.0-draft',
  language: 'ko',
  targetScript: 'Hangul',
  sourceLanguage: 'en',
  reviewStatus: 'draft-needs-pedagogical-review',
  provenance: 'Original Jingu project-authored seed vocabulary and examples. Not copied from a third-party deck. Requires pedagogical review before alpha release.',
  senses: koreanSeeds.map(([slug, lemma, gloss, partOfSpeech, target, source, topic, forms = [], notes], index) => ({
    id: `ko:${slug}`, language: 'ko', sourceLanguage: 'en', lemma, gloss, partOfSpeech,
    examples: [{ target, source }], acceptedForms: [lemma, ...forms], rank: index + 1,
    level: 'beginner', tags: [topic], ...(notes === undefined ? {} : { notes }),
  })),
};

/** Deliberately small fixture, not a release-ready Spanish learning pack. */
export const spanishFixturePack: LanguagePack = {
  id: 'es-en-fixture-v1', version: '1.0.0-draft', language: 'es', targetScript: 'Latin', sourceLanguage: 'en',
  reviewStatus: 'draft-needs-pedagogical-review', provenance: 'Original Jingu test fixture; not a production curriculum.',
  senses: [{
    id: 'es:water', language: 'es', sourceLanguage: 'en', lemma: 'agua', gloss: 'water',
    partOfSpeech: 'noun', examples: [{ target: 'Bebo agua.', source: 'I drink water.' }],
    acceptedForms: ['agua'], rank: 1, level: 'beginner', tags: ['food'],
  }],
};
