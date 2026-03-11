export interface CategoryEntry {
  key: string;
  labelEn: string;
  labelRu: string;
  labelJa: string;
  keywordsEn: string[];
  keywordsJa: string[];
  keywordsRu: string[];
  priorityScore: number;
}

export const CATEGORIES: CategoryEntry[] = [
  { key: 'jackets', labelEn: 'Jackets', labelRu: 'Куртки', labelJa: 'ジャケット', keywordsEn: ['jacket', 'zip jacket', 'bomber', 'blouson', 'rider jacket', 'track jacket', 'military jacket', 'biker jacket', 'trucker'], keywordsJa: ['ジャケット', 'ブルゾン', 'ライダース', 'ボンバー', 'ミリタリージャケット', 'バイカー'], keywordsRu: ['куртка', 'бомбер', 'косуха', 'ветровка'], priorityScore: 9 },
  { key: 'coats', labelEn: 'Coats', labelRu: 'Пальто', labelJa: 'コート', keywordsEn: ['coat', 'overcoat', 'trench', 'long coat', 'wool coat', 'duffle', 'pea coat', 'greatcoat'], keywordsJa: ['コート', 'ロングコート', 'トレンチ', 'ウールコート', 'Pコート', 'チェスターコート'], keywordsRu: ['пальто', 'тренч', 'длинное пальто', 'шерстяное пальто'], priorityScore: 9 },
  { key: 'leather', labelEn: 'Leather', labelRu: 'Кожа', labelJa: 'レザー', keywordsEn: ['leather', 'horsehide', 'calfskin', 'lambskin', 'steerhide', 'cowhide', 'leather jacket', 'leather coat', 'leather pants'], keywordsJa: ['レザー', '革', 'ホースレザー', 'カーフ', 'ラムレザー', 'スムースレザー', 'レザージャケット'], keywordsRu: ['кожа', 'кожаный', 'кожаная', 'натуральная кожа', 'конская кожа'], priorityScore: 10 },
  { key: 'boots', labelEn: 'Boots', labelRu: 'Ботинки', labelJa: 'ブーツ', keywordsEn: ['boots', 'combat boots', 'side zip boots', 'back zip boots', 'engineer boots', 'chelsea boots', 'ankle boots'], keywordsJa: ['ブーツ', 'サイドジップブーツ', 'バックジップ', 'レザーブーツ', 'エンジニアブーツ', 'チェルシーブーツ'], keywordsRu: ['ботинки', 'сапоги', 'кожаные ботинки', 'берцы'], priorityScore: 10 },
  { key: 'hoodies', labelEn: 'Hoodies', labelRu: 'Худи', labelJa: 'パーカー', keywordsEn: ['hoodie', 'zip hoodie', 'hooded sweatshirt', 'sweat hoodie', 'pullover hoodie'], keywordsJa: ['パーカー', 'フーディ', 'ジップパーカー', 'プルオーバー'], keywordsRu: ['худи', 'толстовка', 'зип худи'], priorityScore: 7 },
  { key: 'pants', labelEn: 'Pants', labelRu: 'Брюки', labelJa: 'パンツ', keywordsEn: ['pants', 'trousers', 'slacks', 'cargo pants', 'cargos', 'tailored pants', 'wide pants', 'slim pants'], keywordsJa: ['パンツ', 'スラックス', 'カーゴパンツ', 'テーパード', 'ワイドパンツ'], keywordsRu: ['брюки', 'карго', 'штаны', 'слаксы'], priorityScore: 7 },
  { key: 'denim', labelEn: 'Denim', labelRu: 'Джинсы', labelJa: 'デニム', keywordsEn: ['denim', 'jeans', 'selvedge', 'black denim', 'raw denim', 'slim jeans'], keywordsJa: ['デニム', 'ジーンズ', 'セルヴィッチ'], keywordsRu: ['джинсы', 'деним'], priorityScore: 6 },
  { key: 'knitwear', labelEn: 'Knitwear', labelRu: 'Трикотаж', labelJa: 'ニット', keywordsEn: ['knit', 'sweater', 'jumper', 'cardigan', 'knitwear', 'wool sweater'], keywordsJa: ['ニット', 'セーター', 'カーディガン', 'ウールニット'], keywordsRu: ['свитер', 'кардиган', 'трикотаж', 'вязаный'], priorityScore: 6 },
  { key: 'bags', labelEn: 'Bags', labelRu: 'Сумки', labelJa: 'バッグ', keywordsEn: ['bag', 'tote', 'shoulder bag', 'messenger bag', 'backpack', 'clutch', 'handbag', 'crossbody'], keywordsJa: ['バッグ', 'トート', 'ショルダーバッグ', 'バックパック', 'クラッチ'], keywordsRu: ['сумка', 'тоут', 'рюкзак', 'клатч', 'сумка через плечо'], priorityScore: 8 },
  { key: 'accessories', labelEn: 'Accessories', labelRu: 'Аксессуары', labelJa: 'アクセサリー', keywordsEn: ['belt', 'wallet', 'scarf', 'cap', 'beanie', 'gloves', 'accessory', 'hat'], keywordsJa: ['ベルト', '財布', 'マフラー', 'キャップ', 'アクセサリー', 'ハット'], keywordsRu: ['ремень', 'кошелек', 'шарф', 'аксессуар', 'кепка'], priorityScore: 7 },
  { key: 'jewelry', labelEn: 'Jewelry', labelRu: 'Украшения', labelJa: 'ジュエリー', keywordsEn: ['ring', 'necklace', 'bracelet', 'pendant', 'chain', 'earring', 'jewelry', 'silver'], keywordsJa: ['リング', 'ネックレス', 'ブレスレット', 'ペンダント', 'チェーン', 'シルバー'], keywordsRu: ['кольцо', 'цепь', 'браслет', 'кулон', 'серебро'], priorityScore: 8 },
  { key: 'shirts', labelEn: 'Shirts', labelRu: 'Рубашки', labelJa: 'シャツ', keywordsEn: ['shirt', 'button shirt', 'flannel shirt', 'dress shirt', 'work shirt'], keywordsJa: ['シャツ', 'ドレスシャツ', 'フランネルシャツ', 'ワークシャツ'], keywordsRu: ['рубашка', 'фланелевая рубашка'], priorityScore: 5 }
];
