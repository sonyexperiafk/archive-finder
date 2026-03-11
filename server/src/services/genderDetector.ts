export type Gender = 'men' | 'women' | 'unisex';

const WOMEN_SIGNALS = [
  'women', "women's", 'womens', 'female', 'ladies', 'lady',
  'skirt', 'dress', 'blouse', 'bra', 'lingerie', 'feminine',
  'レディース', 'ウィメンズ', 'スカート', 'ワンピース',
  'レディ', '女性', '女子', '女の子',
  'женское', 'женская', 'женские', 'юбка', 'платье'
] as const;

const MEN_SIGNALS = [
  'men', "men's", 'mens', 'male', 'masculine', 'guy',
  'メンズ', '男性', '男子', '紳士',
  'мужское', 'мужская', 'мужские'
] as const;

const CHILDREN_SIGNALS = [
  'kids', "kids'", 'child', 'children', 'toddler', 'baby', 'infant',
  'boys', "boys'", 'girls', "girls'", 'youth', 'junior', 'teen',
  'newborn', 'size 2t', 'size 3t', 'size 4t',
  'キッズ', '子供', '子ども', 'ベビー', 'ジュニア', '幼児', '男の子', '女の子', '男児', '女児',
  '120cm', '130cm', '140cm', '150cm', '160cm',
  '120㎝', '130㎝', '140㎝', '150㎝', '160㎝',
  'детское', 'детская', 'детские', 'ребенок', 'малыш', 'подросток'
] as const;

const CHILDREN_SIZE_CONTEXT = [
  'size', 'sizes', 'cm', '㎝', 'サイズ',
  'jacket', 'coat', 'shirt', 'tee', 'hoodie', 'sweater', 'knit', 'pants', 'jeans', 'skirt', 'dress', 'suit', 'down',
  'jackets', 'coats', 'shirts', 'pants', 'skirts', 'dresses',
  'ジャケット', 'コート', 'シャツ', 'パーカー', 'ニット', 'パンツ', 'スカート', 'ワンピース', 'スーツ', 'ダウン', 'アウター'
] as const;

const CHILDREN_SIZE_RANGE_PATTERN = /(?:^|[^\d])(8\d|9\d|1[0-5]\d|160)\s*[-/.]\s*(8\d|9\d|1[0-5]\d|160)(?:[^\d]|$)/;
const CHILDREN_SIZE_TOKEN_PATTERN = /(?:^|[^\d])(8\d|9\d|1[0-5]\d|160)(?:\s?(?:cm|㎝|サイズ)|(?=[^\d]|$))/;

function sourceText(title: string, description = '', category = ''): string {
  return `${title} ${description} ${category}`.toLowerCase();
}

function hasChildrenSizePattern(text: string): boolean {
  if (CHILDREN_SIZE_RANGE_PATTERN.test(text)) {
    return true;
  }
  const hasSizeContext = CHILDREN_SIZE_CONTEXT.some((signal) => text.includes(signal.toLowerCase()));
  return hasSizeContext && CHILDREN_SIZE_TOKEN_PATTERN.test(text);
}

export function detectGender(title: string, description = '', category = ''): Gender {
  const text = sourceText(title, description, category);
  const hasWomen = WOMEN_SIGNALS.some((signal) => text.includes(signal.toLowerCase()));
  const hasMen = MEN_SIGNALS.some((signal) => text.includes(signal.toLowerCase()));

  if (hasWomen && !hasMen) return 'women';
  if (hasMen && !hasWomen) return 'men';
  return 'unisex';
}

export function isChildrenItem(title: string, description = '', category = ''): boolean {
  const text = sourceText(title, description, category);
  return CHILDREN_SIGNALS.some((signal) => text.includes(signal.toLowerCase())) || hasChildrenSizePattern(text);
}
