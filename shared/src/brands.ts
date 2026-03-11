export type BrandGroup = 'dark_artisan' | 'japanese_mode' | 'archive_cult' | 'rock_glam' | 'leather_boots' | 'high_demand';
export type MarketTier = 'S' | 'A' | 'B' | 'C' | 'D';

export interface BrandEntry {
  canonical: string;
  aliases: string[];
  group: BrandGroup[];
  tier: MarketTier;
  demandScore: number;
  rarityScore: number;
  resaleScore: number;
  highValueCategories: string[];
  region?: 'JP' | 'EU' | 'US' | 'INTL';
}

const CORE_BRAND_CATALOG: BrandEntry[] = [
  { canonical: 'Carol Christian Poell', aliases: ['ccp', 'carol christian poell', 'carol poell'], group: ['dark_artisan'], tier: 'S', demandScore: 92, rarityScore: 95, resaleScore: 90, highValueCategories: ['jackets', 'boots', 'leather', 'coats'], region: 'EU' },
  { canonical: 'Boris Bidjan Saberi', aliases: ['bbs', 'boris bidjan saberi', 'boris bidjan', 'bbs11'], group: ['dark_artisan'], tier: 'S', demandScore: 88, rarityScore: 90, resaleScore: 85, highValueCategories: ['jackets', 'boots', 'pants', 'leather'], region: 'EU' },
  { canonical: 'Julius', aliases: ['julius', 'julius_7', 'julius7'], group: ['dark_artisan'], tier: 'B', demandScore: 82, rarityScore: 85, resaleScore: 79, highValueCategories: ['jackets', 'pants', 'boots', 'coats'], region: 'JP' },
  { canonical: 'Guidi', aliases: ['guidi'], group: ['dark_artisan', 'leather_boots'], tier: 'S', demandScore: 90, rarityScore: 88, resaleScore: 87, highValueCategories: ['boots', 'bags', 'leather', 'accessories'], region: 'EU' },
  { canonical: 'Devoa', aliases: ['devoa'], group: ['dark_artisan'], tier: 'B', demandScore: 78, rarityScore: 88, resaleScore: 76, highValueCategories: ['jackets', 'coats', 'pants'], region: 'JP' },
  { canonical: 'm.a+', aliases: ['ma+', 'm.a+', 'ma plus', 'maurizio amadei'], group: ['dark_artisan'], tier: 'S', demandScore: 85, rarityScore: 92, resaleScore: 82, highValueCategories: ['jackets', 'coats', 'boots', 'leather'], region: 'EU' },
  { canonical: 'Layer-0', aliases: ['layer-0', 'layer 0', 'layer0'], group: ['dark_artisan'], tier: 'S', demandScore: 80, rarityScore: 90, resaleScore: 78, highValueCategories: ['jackets', 'coats', 'leather'], region: 'EU' },
  { canonical: 'Leon Emanuel Blanck', aliases: ['leon emanuel blanck', 'leb', 'leon blanck'], group: ['dark_artisan'], tier: 'S', demandScore: 78, rarityScore: 92, resaleScore: 76, highValueCategories: ['jackets', 'coats', 'bags'], region: 'EU' },
  { canonical: 'A1923', aliases: ['a1923', 'andrea clossi'], group: ['dark_artisan', 'leather_boots'], tier: 'S', demandScore: 80, rarityScore: 90, resaleScore: 78, highValueCategories: ['boots', 'leather', 'bags'], region: 'EU' },
  { canonical: 'Augusta', aliases: ['augusta'], group: ['dark_artisan', 'leather_boots'], tier: 'S', demandScore: 75, rarityScore: 90, resaleScore: 72, highValueCategories: ['boots', 'leather', 'bags'], region: 'EU' },
  { canonical: 'Isaac Sellam', aliases: ['isaac sellam', 'isaac sellam experience', 'i.s.e.'], group: ['dark_artisan', 'leather_boots'], tier: 'S', demandScore: 82, rarityScore: 87, resaleScore: 80, highValueCategories: ['jackets', 'leather', 'coats'], region: 'EU' },
  { canonical: 'Incarnation', aliases: ['incarnation'], group: ['dark_artisan', 'leather_boots'], tier: 'A', demandScore: 75, rarityScore: 82, resaleScore: 73, highValueCategories: ['jackets', 'leather', 'boots', 'pants'], region: 'JP' },
  { canonical: 'The Viridi-Anne', aliases: ['the viridi-anne', 'viridi anne', 'viridi-anne', 'tva'], group: ['dark_artisan'], tier: 'A', demandScore: 72, rarityScore: 80, resaleScore: 70, highValueCategories: ['jackets', 'coats', 'knitwear'], region: 'JP' },
  { canonical: 'Forme d\'Expression', aliases: ['forme d\'expression', 'forme expression', 'fde'], group: ['dark_artisan'], tier: 'A', demandScore: 70, rarityScore: 85, resaleScore: 68, highValueCategories: ['jackets', 'coats', 'pants'], region: 'EU' },
  { canonical: 'Label Under Construction', aliases: ['label under construction', 'luc', 'label u.c.'], group: ['dark_artisan'], tier: 'A', demandScore: 72, rarityScore: 82, resaleScore: 70, highValueCategories: ['jackets', 'leather', 'accessories'], region: 'JP' },
  { canonical: 'Poeme Bohemien', aliases: ['poeme bohemien', 'poème bohémien'], group: ['dark_artisan'], tier: 'A', demandScore: 68, rarityScore: 82, resaleScore: 65, highValueCategories: ['jackets', 'coats', 'leather'], region: 'EU' },
  { canonical: 'Masnada', aliases: ['masnada'], group: ['dark_artisan'], tier: 'A', demandScore: 65, rarityScore: 78, resaleScore: 63, highValueCategories: ['jackets', 'pants', 'coats'], region: 'EU' },
  { canonical: 'Ziggy Chen', aliases: ['ziggy chen'], group: ['dark_artisan'], tier: 'A', demandScore: 68, rarityScore: 78, resaleScore: 65, highValueCategories: ['jackets', 'coats', 'shirts'], region: 'INTL' },
  { canonical: 'Individual Sentiments', aliases: ['individual sentiments', 'i.s.', 'individual s.'], group: ['dark_artisan'], tier: 'A', demandScore: 65, rarityScore: 80, resaleScore: 62, highValueCategories: ['jackets', 'coats', 'bags'], region: 'JP' },
  { canonical: 'Werkstatt München', aliases: ['werkstatt münchen', 'werkstatt munchen', 'werkstatt'], group: ['dark_artisan', 'leather_boots'], tier: 'B', demandScore: 72, rarityScore: 75, resaleScore: 70, highValueCategories: ['accessories', 'jewelry', 'leather'], region: 'EU' },
  { canonical: 'ISAMU KATAYAMA BACKLASH', aliases: ['backlash', 'isamu katayama backlash', 'i.k. backlash', 'isamu katayama'], group: ['dark_artisan', 'leather_boots'], tier: 'A', demandScore: 78, rarityScore: 80, resaleScore: 76, highValueCategories: ['jackets', 'boots', 'leather', 'accessories'], region: 'JP' },
  { canonical: 'STRUM', aliases: ['strum'], group: ['dark_artisan', 'leather_boots'], tier: 'B', demandScore: 70, rarityScore: 75, resaleScore: 68, highValueCategories: ['jackets', 'leather', 'boots'], region: 'JP' },
  { canonical: 'Attachment', aliases: ['attachment', 'kazuyuki kumagai', 'attachment kazuyuki'], group: ['dark_artisan'], tier: 'B', demandScore: 68, rarityScore: 72, resaleScore: 66, highValueCategories: ['jackets', 'pants', 'knitwear'], region: 'JP' },
  { canonical: 'Sulvam', aliases: ['sulvam'], group: ['dark_artisan', 'japanese_mode'], tier: 'B', demandScore: 65, rarityScore: 72, resaleScore: 63, highValueCategories: ['jackets', 'pants', 'coats'], region: 'JP' },
  { canonical: 'Ethosens', aliases: ['ethosens'], group: ['dark_artisan'], tier: 'B', demandScore: 62, rarityScore: 75, resaleScore: 60, highValueCategories: ['jackets', 'coats', 'pants'], region: 'JP' },
  { canonical: 'Ohta', aliases: ['ohta'], group: ['dark_artisan'], tier: 'B', demandScore: 60, rarityScore: 75, resaleScore: 58, highValueCategories: ['jackets', 'coats'], region: 'JP' },
  { canonical: 'Thom Krom', aliases: ['thom krom', 'thomkrom'], group: ['dark_artisan'], tier: 'B', demandScore: 65, rarityScore: 72, resaleScore: 63, highValueCategories: ['jackets', 'coats'], region: 'EU' },
  { canonical: 'Transit Uomo', aliases: ['transit uomo', 'transit'], group: ['dark_artisan'], tier: 'B', demandScore: 60, rarityScore: 68, resaleScore: 58, highValueCategories: ['coats', 'jackets'], region: 'EU' },
  { canonical: 'D.HYGEN', aliases: ['d.hygen', 'dhygen'], group: ['dark_artisan'], tier: 'B', demandScore: 62, rarityScore: 70, resaleScore: 60, highValueCategories: ['jackets', 'pants'], region: 'JP' },
  { canonical: 'nude:masahiko maruyama', aliases: ['nude masahiko', 'nude:mm', 'nudemm', 'nude:masahiko maruyama'], group: ['dark_artisan'], tier: 'B', demandScore: 60, rarityScore: 70, resaleScore: 58, highValueCategories: ['jackets', 'pants', 'knitwear'], region: 'JP' },
  { canonical: 'Klasica', aliases: ['klasica'], group: ['dark_artisan'], tier: 'B', demandScore: 58, rarityScore: 70, resaleScore: 56, highValueCategories: ['jackets', 'coats'], region: 'JP' },
  { canonical: 'OURET', aliases: ['ouret'], group: ['dark_artisan', 'japanese_mode'], tier: 'B', demandScore: 60, rarityScore: 68, resaleScore: 58, highValueCategories: ['jackets', 'pants'], region: 'JP' },
  { canonical: 'Bajra', aliases: ['bajra'], group: ['dark_artisan'], tier: 'B', demandScore: 58, rarityScore: 70, resaleScore: 56, highValueCategories: ['jackets', 'knitwear'], region: 'JP' },
  { canonical: 'N/07', aliases: ['n/07', 'n07'], group: ['dark_artisan'], tier: 'B', demandScore: 60, rarityScore: 68, resaleScore: 58, highValueCategories: ['jackets', 'pants', 'coats'], region: 'JP' },
  { canonical: 'Ripvanwinkle', aliases: ['ripvanwinkle', 'rip van winkle'], group: ['dark_artisan', 'japanese_mode'], tier: 'B', demandScore: 62, rarityScore: 70, resaleScore: 60, highValueCategories: ['coats', 'jackets', 'knitwear'], region: 'JP' },
  { canonical: '10sei0otto', aliases: ['10sei0otto', '10sei otto'], group: ['dark_artisan'], tier: 'B', demandScore: 58, rarityScore: 72, resaleScore: 55, highValueCategories: ['jackets', 'leather'], region: 'EU' },
  { canonical: 'Lost & Found', aliases: ['lost and found', 'lost & found', 'lostandfound'], group: ['dark_artisan'], tier: 'B', demandScore: 60, rarityScore: 72, resaleScore: 58, highValueCategories: ['coats', 'jackets'], region: 'EU' },
  { canonical: 'Damir Doma', aliases: ['damir doma'], group: ['dark_artisan'], tier: 'A', demandScore: 78, rarityScore: 78, resaleScore: 75, highValueCategories: ['jackets', 'coats', 'pants', 'boots'], region: 'EU' },
  { canonical: 'Craig Green', aliases: ['craig green'], group: ['dark_artisan'], tier: 'A', demandScore: 76, rarityScore: 75, resaleScore: 73, highValueCategories: ['jackets', 'coats', 'accessories'], region: 'EU' },
  { canonical: 'Kiko Kostadinov', aliases: ['kiko kostadinov', 'kiko'], group: ['dark_artisan'], tier: 'A', demandScore: 78, rarityScore: 73, resaleScore: 75, highValueCategories: ['jackets', 'pants', 'shoes'], region: 'EU' },
  { canonical: 'Y-Project', aliases: ['y/project', 'y project', 'yproject'], group: ['dark_artisan'], tier: 'A', demandScore: 78, rarityScore: 70, resaleScore: 75, highValueCategories: ['jackets', 'pants', 'boots'], region: 'EU' },
  { canonical: 'Lemaire', aliases: ['lemaire'], group: ['dark_artisan'], tier: 'A', demandScore: 80, rarityScore: 68, resaleScore: 78, highValueCategories: ['coats', 'jackets', 'pants', 'bags'], region: 'EU' },
  { canonical: 'Yohji Yamamoto', aliases: ['yohji yamamoto', 'yohji', "y's", 'ground y', 's’yte', 'syte', 'limi feu', 'limi', 'ヨウジヤマモト'], group: ['japanese_mode', 'high_demand'], tier: 'S', demandScore: 92, rarityScore: 78, resaleScore: 90, highValueCategories: ['coats', 'jackets', 'pants', 'shirts', 'knitwear'], region: 'JP' },
  { canonical: 'Comme des Garçons Homme Plus', aliases: ['comme des garcons homme plus', 'cdg homme plus', 'cdgh+', 'cdg+', 'コムデギャルソンオムプリュス'], group: ['japanese_mode'], tier: 'A', demandScore: 88, rarityScore: 78, resaleScore: 85, highValueCategories: ['jackets', 'coats', 'shirts'], region: 'JP' },
  { canonical: 'Comme des Garçons Homme', aliases: ['comme des garcons homme', 'cdg homme', 'cdgh', 'コムデギャルソンオム'], group: ['japanese_mode'], tier: 'A', demandScore: 82, rarityScore: 72, resaleScore: 80, highValueCategories: ['jackets', 'coats', 'shirts', 'pants'], region: 'JP' },
  { canonical: 'Junya Watanabe', aliases: ['junya watanabe', 'junya', 'jw cdg'], group: ['japanese_mode'], tier: 'A', demandScore: 82, rarityScore: 75, resaleScore: 80, highValueCategories: ['jackets', 'coats', 'denim', 'shirts'], region: 'JP' },
  { canonical: 'Undercover', aliases: ['undercover', 'undercoverism', 'under cover', 'アンダーカバー'], group: ['japanese_mode', 'archive_cult', 'high_demand'], tier: 'S', demandScore: 92, rarityScore: 82, resaleScore: 90, highValueCategories: ['jackets', 'hoodies', 'coats', 'knitwear'], region: 'JP' },
  { canonical: 'Number (N)ine', aliases: ['number nine', 'number (n)ine', 'numbernine', 'number9', 'n(n)', 'ナンバーナイン'], group: ['japanese_mode', 'archive_cult'], tier: 'A', demandScore: 90, rarityScore: 88, resaleScore: 88, highValueCategories: ['jackets', 'hoodies', 'denim', 'knitwear', 'accessories'], region: 'JP' },
  { canonical: 'Takahiromiyashita The Soloist', aliases: ['the soloist', 'soloist', 'takahiromiyashita', 'takahiro miyashita'], group: ['japanese_mode'], tier: 'A', demandScore: 85, rarityScore: 82, resaleScore: 82, highValueCategories: ['jackets', 'shirts', 'accessories', 'boots'], region: 'JP' },
  { canonical: 'Issey Miyake Men', aliases: ['issey miyake men', 'issey men', 'im men'], group: ['japanese_mode'], tier: 'A', demandScore: 80, rarityScore: 72, resaleScore: 78, highValueCategories: ['jackets', 'coats', 'pants', 'knitwear'], region: 'JP' },
  { canonical: 'Homme Plissé Issey Miyake', aliases: ['homme plisse', 'homme plissé', 'pleats please men'], group: ['japanese_mode'], tier: 'B', demandScore: 78, rarityScore: 65, resaleScore: 75, highValueCategories: ['jackets', 'pants', 'shirts'], region: 'JP' },
  { canonical: 'Noir Kei Ninomiya', aliases: ['noir kei ninomiya', 'noir', 'kei ninomiya'], group: ['japanese_mode'], tier: 'A', demandScore: 80, rarityScore: 80, resaleScore: 78, highValueCategories: ['jackets', 'coats', 'knitwear'], region: 'JP' },
  { canonical: 'Hysteric Glamour', aliases: ['hysteric glamour', 'hysteric'], group: ['japanese_mode', 'archive_cult', 'rock_glam'], tier: 'B', demandScore: 80, rarityScore: 75, resaleScore: 78, highValueCategories: ['jackets', 'hoodies', 'shirts', 'denim'], region: 'JP' },
  { canonical: 'Lad Musician', aliases: ['lad musician', 'lad', 'ladmusician'], group: ['japanese_mode', 'archive_cult', 'rock_glam'], tier: 'B', demandScore: 75, rarityScore: 78, resaleScore: 73, highValueCategories: ['jackets', 'pants', 'boots', 'hoodies'], region: 'JP' },
  { canonical: 'Kapital', aliases: ['kapital'], group: ['japanese_mode', 'high_demand'], tier: 'S', demandScore: 86, rarityScore: 72, resaleScore: 84, highValueCategories: ['jackets', 'denim', 'knitwear', 'accessories'], region: 'JP' },
  { canonical: 'Visvim', aliases: ['visvim', 'fbt'], group: ['japanese_mode', 'high_demand'], tier: 'S', demandScore: 86, rarityScore: 72, resaleScore: 84, highValueCategories: ['shoes', 'boots', 'jackets', 'shirts'], region: 'JP' },
  { canonical: 'N.Hoolywood', aliases: ['n.hoolywood', 'nhoolywood', 'n hoolywood'], group: ['japanese_mode'], tier: 'B', demandScore: 70, rarityScore: 68, resaleScore: 68, highValueCategories: ['jackets', 'coats', 'pants'], region: 'JP' },
  { canonical: 'White Mountaineering', aliases: ['white mountaineering', 'wm'], group: ['japanese_mode'], tier: 'B', demandScore: 68, rarityScore: 65, resaleScore: 66, highValueCategories: ['jackets', 'outerwear', 'pants'], region: 'JP' },
  { canonical: 'Needles', aliases: ['needles', 'nepenthes'], group: ['japanese_mode'], tier: 'B', demandScore: 78, rarityScore: 65, resaleScore: 75, highValueCategories: ['pants', 'jackets', 'shirts', 'knitwear'], region: 'JP' },
  { canonical: 'Engineered Garments', aliases: ['engineered garments', 'eg'], group: ['japanese_mode'], tier: 'C', demandScore: 72, rarityScore: 60, resaleScore: 70, highValueCategories: ['jackets', 'pants', 'shirts'], region: 'US' },
  { canonical: 'Rick Owens', aliases: ['rick owens', 'rick', 'リックオウエンス'], group: ['archive_cult', 'high_demand'], tier: 'S', demandScore: 95, rarityScore: 75, resaleScore: 94, highValueCategories: ['boots', 'jackets', 'hoodies', 'pants', 'leather'], region: 'EU' },
  { canonical: 'DRKSHDW', aliases: ['drkshdw', 'rick owens drkshdw', 'dark shadow'], group: ['archive_cult', 'high_demand'], tier: 'B', demandScore: 85, rarityScore: 65, resaleScore: 82, highValueCategories: ['jackets', 'hoodies', 'pants', 'boots'], region: 'EU' },
  { canonical: 'Maison Margiela', aliases: ['maison margiela', 'margiela', 'maison martin margiela', 'mmm'], group: ['archive_cult', 'high_demand'], tier: 'S', demandScore: 92, rarityScore: 80, resaleScore: 90, highValueCategories: ['jackets', 'boots', 'coats', 'accessories'], region: 'EU' },
  { canonical: 'MM6', aliases: ['mm6', 'mm6 maison margiela'], group: ['archive_cult'], tier: 'B', demandScore: 72, rarityScore: 62, resaleScore: 70, highValueCategories: ['jackets', 'coats', 'pants'], region: 'EU' },
  { canonical: 'Ann Demeulemeester', aliases: ['ann demeulemeester', 'ann d', 'ann dem'], group: ['archive_cult'], tier: 'A', demandScore: 85, rarityScore: 82, resaleScore: 83, highValueCategories: ['boots', 'jackets', 'coats', 'shirts'], region: 'EU' },
  { canonical: 'Dries Van Noten', aliases: ['dries van noten', 'dvn', 'dries'], group: ['archive_cult'], tier: 'A', demandScore: 82, rarityScore: 75, resaleScore: 80, highValueCategories: ['jackets', 'coats', 'shirts', 'pants'], region: 'EU' },
  { canonical: 'Dirk Bikkembergs', aliases: ['dirk bikkembergs', 'bikkembergs', 'dirk b'], group: ['archive_cult'], tier: 'A', demandScore: 80, rarityScore: 85, resaleScore: 78, highValueCategories: ['boots', 'jackets', 'pants'], region: 'EU' },
  { canonical: 'Helmut Lang', aliases: ['helmut lang', 'helmut'], group: ['archive_cult'], tier: 'A', demandScore: 88, rarityScore: 85, resaleScore: 86, highValueCategories: ['jackets', 'leather', 'pants', 'shirts'], region: 'EU' },
  { canonical: 'Raf Simons', aliases: ['raf simons', 'raf'], group: ['archive_cult'], tier: 'A', demandScore: 90, rarityScore: 85, resaleScore: 88, highValueCategories: ['jackets', 'hoodies', 'denim', 'boots'], region: 'EU' },
  { canonical: 'Chrome Hearts', aliases: ['chrome hearts', 'chromeheart', 'chrome'], group: ['archive_cult', 'high_demand', 'leather_boots'], tier: 'S', demandScore: 94, rarityScore: 80, resaleScore: 92, highValueCategories: ['accessories', 'jewelry', 'leather', 'hoodies'], region: 'US' },
  { canonical: 'beauty:beast', aliases: ['beauty:beast', 'beauty beast', 'beautybeast'], group: ['archive_cult', 'japanese_mode'], tier: 'A', demandScore: 78, rarityScore: 85, resaleScore: 75, highValueCategories: ['jackets', 'coats', 'accessories'], region: 'JP' },
  { canonical: '20471120', aliases: ['20471120', '2047'], group: ['archive_cult', 'japanese_mode'], tier: 'A', demandScore: 75, rarityScore: 85, resaleScore: 73, highValueCategories: ['jackets', 'coats', 'hoodies'], region: 'JP' },
  { canonical: 'Mastermind Japan', aliases: ['mastermind japan', 'mastermind', 'mmj'], group: ['archive_cult'], tier: 'B', demandScore: 78, rarityScore: 75, resaleScore: 75, highValueCategories: ['hoodies', 'jackets', 'accessories', 'denim'], region: 'JP' },
  { canonical: 'Na+H', aliases: ['na+h', 'nah', 'na h'], group: ['archive_cult', 'japanese_mode'], tier: 'A', demandScore: 72, rarityScore: 82, resaleScore: 70, highValueCategories: ['jackets', 'coats'], region: 'JP' },
  { canonical: 'AFFA', aliases: ['affa', 'a.f.f.a'], group: ['archive_cult'], tier: 'A', demandScore: 75, rarityScore: 85, resaleScore: 73, highValueCategories: ['jackets', 'hoodies', 'accessories'], region: 'JP' },
  { canonical: 'Bounty Hunter', aliases: ['bounty hunter', 'bountyhunter'], group: ['archive_cult'], tier: 'B', demandScore: 65, rarityScore: 78, resaleScore: 63, highValueCategories: ['jackets', 'accessories'], region: 'JP' },
  { canonical: 'Jil Sander', aliases: ['jil sander', 'jilsander'], group: ['archive_cult'], tier: 'A', demandScore: 80, rarityScore: 70, resaleScore: 78, highValueCategories: ['coats', 'jackets', 'pants'], region: 'EU' },
  { canonical: 'L.G.B.', aliases: ['lgb', 'l.g.b.', 'le grand bleu', 'lgb japan'], group: ['archive_cult', 'rock_glam'], tier: 'A', demandScore: 80, rarityScore: 85, resaleScore: 78, highValueCategories: ['jackets', 'pants', 'boots', 'accessories'], region: 'JP' },
  { canonical: 'If Six Was Nine', aliases: ['if six was nine', 'ifsixwasnine', 'i6wn'], group: ['archive_cult', 'rock_glam'], tier: 'A', demandScore: 78, rarityScore: 85, resaleScore: 76, highValueCategories: ['jackets', 'boots', 'pants', 'accessories'], region: 'JP' },
  { canonical: 'KMRii', aliases: ['kmrii', 'kmr2', 'kmrii japan'], group: ['archive_cult', 'rock_glam'], tier: 'A', demandScore: 75, rarityScore: 82, resaleScore: 73, highValueCategories: ['jackets', 'pants', 'boots', 'accessories'], region: 'JP' },
  { canonical: 'Roen', aliases: ['roen'], group: ['rock_glam', 'archive_cult'], tier: 'B', demandScore: 72, rarityScore: 78, resaleScore: 70, highValueCategories: ['jackets', 'pants', 'boots', 'accessories'], region: 'JP' },
  { canonical: 'Roar', aliases: ['roar japan', 'roar'], group: ['rock_glam'], tier: 'B', demandScore: 63, rarityScore: 72, resaleScore: 61, highValueCategories: ['jackets', 'accessories'], region: 'JP' },
  { canonical: 'Shellac', aliases: ['shellac'], group: ['rock_glam', 'archive_cult'], tier: 'B', demandScore: 68, rarityScore: 78, resaleScore: 65, highValueCategories: ['jackets', 'pants', 'accessories'], region: 'JP' },
  { canonical: 'Tornado Mart', aliases: ['tornado mart', 'tornadomart'], group: ['rock_glam', 'archive_cult'], tier: 'B', demandScore: 65, rarityScore: 78, resaleScore: 63, highValueCategories: ['jackets', 'pants', 'accessories'], region: 'JP' },
  { canonical: 'GalaabenD', aliases: ['galaabend', 'galaaband', 'galaabend japan'], group: ['rock_glam', 'archive_cult'], tier: 'B', demandScore: 68, rarityScore: 78, resaleScore: 65, highValueCategories: ['jackets', 'accessories', 'boots'], region: 'JP' },
  { canonical: 'No ID.', aliases: ['no id.', 'no id', 'noid'], group: ['rock_glam', 'archive_cult'], tier: 'B', demandScore: 65, rarityScore: 72, resaleScore: 63, highValueCategories: ['jackets', 'pants', 'accessories'], region: 'JP' },
  { canonical: 'Vanquish', aliases: ['vanquish', 'black by vanquish'], group: ['rock_glam'], tier: 'C', demandScore: 55, rarityScore: 60, resaleScore: 53, highValueCategories: ['jackets', 'pants'], region: 'JP' },
  { canonical: 'Royal Flash', aliases: ['royal flash'], group: ['rock_glam'], tier: 'C', demandScore: 52, rarityScore: 60, resaleScore: 50, highValueCategories: ['jackets', 'accessories'], region: 'JP' },
  { canonical: 'Varosh', aliases: ['varosh'], group: ['rock_glam'], tier: 'C', demandScore: 50, rarityScore: 60, resaleScore: 48, highValueCategories: ['jackets', 'accessories'], region: 'JP' },
  { canonical: 'FAGASSENT', aliases: ['fagassent'], group: ['rock_glam', 'dark_artisan'], tier: 'B', demandScore: 65, rarityScore: 72, resaleScore: 63, highValueCategories: ['jackets', 'boots', 'leather'], region: 'JP' },
  { canonical: 'Neighborhood', aliases: ['neighborhood', 'nhbd'], group: ['high_demand'], tier: 'B', demandScore: 78, rarityScore: 65, resaleScore: 75, highValueCategories: ['jackets', 'hoodies', 'accessories'], region: 'JP' },
  { canonical: 'WTAPS', aliases: ['wtaps', 'w-taps'], group: ['high_demand'], tier: 'B', demandScore: 80, rarityScore: 68, resaleScore: 78, highValueCategories: ['jackets', 'hoodies', 'accessories'], region: 'JP' },
  { canonical: 'Human Made', aliases: ['human made', 'humanmade'], group: ['high_demand'], tier: 'B', demandScore: 75, rarityScore: 62, resaleScore: 72, highValueCategories: ['hoodies', 'jackets', 'accessories'], region: 'JP' },
  { canonical: 'Cav Empt', aliases: ['cav empt', 'cavempt', 'c.e'], group: ['high_demand'], tier: 'B', demandScore: 72, rarityScore: 68, resaleScore: 70, highValueCategories: ['hoodies', 'jackets', 'accessories'], region: 'JP' },
  { canonical: 'Sacai', aliases: ['sacai'], group: ['japanese_mode'], tier: 'A', demandScore: 82, rarityScore: 70, resaleScore: 80, highValueCategories: ['jackets', 'coats', 'pants', 'shoes'], region: 'JP' },
  { canonical: 'Kolor', aliases: ['kolor'], group: ['japanese_mode'], tier: 'B', demandScore: 70, rarityScore: 65, resaleScore: 68, highValueCategories: ['jackets', 'coats', 'pants'], region: 'JP' },
  { canonical: 'Nanamica', aliases: ['nanamica'], group: ['japanese_mode'], tier: 'C', demandScore: 65, rarityScore: 58, resaleScore: 63, highValueCategories: ['outerwear', 'jackets'], region: 'JP' },
  { canonical: 'Snow Peak', aliases: ['snow peak', 'snowpeak'], group: ['japanese_mode'], tier: 'C', demandScore: 65, rarityScore: 55, resaleScore: 62, highValueCategories: ['outerwear', 'jackets', 'accessories'], region: 'JP' },
  { canonical: 'Vivienne Westwood', aliases: ['vivienne westwood', 'vw'], group: ['high_demand'], tier: 'D', demandScore: 78, rarityScore: 65, resaleScore: 75, highValueCategories: ['accessories', 'jackets', 'bags'], region: 'EU' },
  { canonical: 'Haider Ackermann', aliases: ['haider ackermann', 'haider'], group: ['high_demand'], tier: 'C', demandScore: 72, rarityScore: 70, resaleScore: 70, highValueCategories: ['coats', 'jackets', 'shirts'], region: 'EU' }
];

type GeneratedBrandSeed = {
  canonical: string;
  aliases?: string[];
  group: BrandGroup[];
  tier: MarketTier;
  highValueCategories: string[];
  region?: 'JP' | 'EU' | 'US' | 'INTL';
  demandScore?: number;
  rarityScore?: number;
  resaleScore?: number;
};

function uniqueAliases(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function buildAliasVariants(canonical: string, aliases: string[] = []): string[] {
  const normalized = canonical
    .replace(/[’`´]/g, "'")
    .replace(/[“”]/g, '"');
  const ascii = normalized
    .replace(/&/g, 'and')
    .replace(/\./g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return uniqueAliases([
    canonical,
    normalized,
    normalized.toLowerCase(),
    ascii,
    ascii.toLowerCase(),
    normalized.replace(/\s+/g, ''),
    normalized.replace(/[:.+\-()/]/g, ' ').replace(/\s+/g, ' ').trim(),
    ...aliases
  ]);
}

function tierDefaults(tier: MarketTier): Pick<BrandEntry, 'demandScore' | 'rarityScore' | 'resaleScore'> {
  if (tier === 'S') return { demandScore: 90, rarityScore: 86, resaleScore: 88 };
  if (tier === 'A') return { demandScore: 82, rarityScore: 78, resaleScore: 80 };
  if (tier === 'B') return { demandScore: 72, rarityScore: 70, resaleScore: 70 };
  if (tier === 'C') return { demandScore: 62, rarityScore: 60, resaleScore: 60 };
  return { demandScore: 54, rarityScore: 54, resaleScore: 54 };
}

function buildGeneratedBrand(seed: GeneratedBrandSeed): BrandEntry {
  const defaults = tierDefaults(seed.tier);
  return {
    canonical: seed.canonical,
    aliases: buildAliasVariants(seed.canonical, seed.aliases),
    group: seed.group,
    tier: seed.tier,
    demandScore: seed.demandScore ?? defaults.demandScore,
    rarityScore: seed.rarityScore ?? defaults.rarityScore,
    resaleScore: seed.resaleScore ?? defaults.resaleScore,
    highValueCategories: seed.highValueCategories,
    region: seed.region
  };
}

const GENERATED_BRAND_SEEDS: GeneratedBrandSeed[] = [
  { canonical: 'Comme des Garçons', aliases: ['comme des garcons', 'cdg', 'コムデギャルソン'], group: ['japanese_mode', 'high_demand'], tier: 'A', highValueCategories: ['jackets', 'coats', 'shirts'], region: 'JP', demandScore: 86, rarityScore: 76, resaleScore: 84 },
  { canonical: 'Comme des Garçons SHIRT', aliases: ['comme des garcons shirt', 'cdg shirt'], group: ['japanese_mode'], tier: 'B', highValueCategories: ['shirts', 'jackets', 'coats'], region: 'JP' },
  { canonical: 'Junya Watanabe Man', aliases: ['junya watanabe man', 'eYe junya watanabe man'], group: ['japanese_mode'], tier: 'A', highValueCategories: ['jackets', 'coats', 'shirts'], region: 'JP' },
  { canonical: 'Issey Miyake', aliases: ['issey miyake', 'イッセイミヤケ'], group: ['japanese_mode', 'high_demand'], tier: 'A', highValueCategories: ['jackets', 'coats', 'pants', 'knitwear'], region: 'JP', demandScore: 84, rarityScore: 72, resaleScore: 82 },
  { canonical: 'Pleats Please', aliases: ['pleats please', 'プリーツプリーズ'], group: ['japanese_mode'], tier: 'B', highValueCategories: ['shirts', 'pants', 'jackets'], region: 'JP' },
  { canonical: 'Y’s', aliases: ["y's", 'ys yohji', 'ワイズ'], group: ['japanese_mode'], tier: 'A', highValueCategories: ['coats', 'jackets', 'pants'], region: 'JP' },
  { canonical: 'S’yte', aliases: ['s’yte', 'syte'], group: ['japanese_mode'], tier: 'B', highValueCategories: ['coats', 'jackets'], region: 'JP' },
  { canonical: 'Ground Y', aliases: ['ground y'], group: ['japanese_mode'], tier: 'B', highValueCategories: ['coats', 'jackets'], region: 'JP' },
  { canonical: 'LIMI feu', aliases: ['limi feu', 'limi'], group: ['japanese_mode'], tier: 'B', highValueCategories: ['coats', 'jackets'], region: 'JP' },
  { canonical: 'Maison Mihara Yasuhiro', aliases: ['maison mihara yasuhiro', 'miharayasuhiro', 'mihara yasuhiro'], group: ['japanese_mode'], tier: 'B', highValueCategories: ['shoes', 'jackets', 'shirts'], region: 'JP' },
  { canonical: 'Beams', aliases: ['beams'], group: ['japanese_mode'], tier: 'D', highValueCategories: ['jackets', 'shirts'], region: 'JP' },
  { canonical: 'United Arrows', aliases: ['united arrows'], group: ['japanese_mode'], tier: 'D', highValueCategories: ['jackets', 'coats'], region: 'JP' },
  { canonical: 'Journal Standard', aliases: ['journal standard'], group: ['japanese_mode'], tier: 'D', highValueCategories: ['jackets', 'coats'], region: 'JP' },
  { canonical: 'Auralee', aliases: ['auralee'], group: ['japanese_mode'], tier: 'B', highValueCategories: ['coats', 'jackets', 'knitwear'], region: 'JP' },
  { canonical: 'Graphpaper', aliases: ['graphpaper'], group: ['japanese_mode'], tier: 'B', highValueCategories: ['coats', 'jackets', 'shirts'], region: 'JP' },
  { canonical: 'Markaware', aliases: ['markaware'], group: ['japanese_mode'], tier: 'B', highValueCategories: ['coats', 'jackets', 'pants'], region: 'JP' },
  { canonical: 'marka', aliases: ['marka'], group: ['japanese_mode'], tier: 'C', highValueCategories: ['jackets', 'pants'], region: 'JP' },
  { canonical: 'Stein', aliases: ['stein'], group: ['japanese_mode'], tier: 'B', highValueCategories: ['coats', 'jackets', 'pants'], region: 'JP' },
  { canonical: 'Yoke', aliases: ['yoke'], group: ['japanese_mode'], tier: 'B', highValueCategories: ['coats', 'jackets', 'knitwear'], region: 'JP' },
  { canonical: 'Jieda', aliases: ['jieda'], group: ['japanese_mode'], tier: 'B', highValueCategories: ['jackets', 'pants', 'denim'], region: 'JP' },
  { canonical: 'Dulcamara', aliases: ['dulcamara'], group: ['japanese_mode'], tier: 'C', highValueCategories: ['coats', 'jackets'], region: 'JP' },
  { canonical: 'UJOH', aliases: ['ujoh'], group: ['japanese_mode'], tier: 'B', highValueCategories: ['coats', 'jackets', 'pants'], region: 'JP' },
  { canonical: 'Yuki Hashimoto', aliases: ['yuki hashimoto'], group: ['japanese_mode'], tier: 'B', highValueCategories: ['jackets', 'pants', 'knitwear'], region: 'JP' },
  { canonical: 'Irenisa', aliases: ['irenisa'], group: ['japanese_mode'], tier: 'B', highValueCategories: ['coats', 'jackets'], region: 'JP' },
  { canonical: 'TAAKK', aliases: ['taakk'], group: ['japanese_mode'], tier: 'B', highValueCategories: ['jackets', 'shirts'], region: 'JP' },
  { canonical: 'Children of the Discordance', aliases: ['children of the discordance'], group: ['japanese_mode', 'archive_cult'], tier: 'B', highValueCategories: ['jackets', 'shirts', 'pants'], region: 'JP' },
  { canonical: 'NICENESS', aliases: ['niceness'], group: ['japanese_mode'], tier: 'B', highValueCategories: ['coats', 'jackets', 'leather'], region: 'JP' },
  { canonical: 'blurhms', aliases: ['blurhms'], group: ['japanese_mode'], tier: 'C', highValueCategories: ['jackets', 'knitwear'], region: 'JP' },
  { canonical: 'CULLNI', aliases: ['cullni'], group: ['japanese_mode'], tier: 'C', highValueCategories: ['coats', 'jackets'], region: 'JP' },
  { canonical: 'United Tokyo', aliases: ['united tokyo'], group: ['japanese_mode'], tier: 'D', highValueCategories: ['coats', 'jackets'], region: 'JP' },
  { canonical: 'Meanswhile', aliases: ['meanswhile'], group: ['japanese_mode'], tier: 'C', highValueCategories: ['outerwear', 'jackets', 'bags'], region: 'JP' },
  { canonical: 'And Wander', aliases: ['and wander'], group: ['japanese_mode'], tier: 'C', highValueCategories: ['outerwear', 'jackets', 'bags'], region: 'JP' },
  { canonical: 'Descente Allterrain', aliases: ['descente allterrain', 'allterrain'], group: ['japanese_mode'], tier: 'C', highValueCategories: ['outerwear', 'jackets'], region: 'JP' },
  { canonical: 'Unused', aliases: ['unused'], group: ['japanese_mode'], tier: 'C', highValueCategories: ['jackets', 'pants'], region: 'JP' },
  { canonical: 'Kuon', aliases: ['kuon'], group: ['japanese_mode'], tier: 'C', highValueCategories: ['jackets', 'shirts'], region: 'JP' },
  { canonical: 'Liberaiders', aliases: ['liberaiders'], group: ['japanese_mode', 'high_demand'], tier: 'C', highValueCategories: ['jackets', 'pants'], region: 'JP' },
  { canonical: 'Studio Nicholson', aliases: ['studio nicholson'], group: ['japanese_mode'], tier: 'B', highValueCategories: ['coats', 'jackets', 'pants'], region: 'EU' },
  { canonical: 'Snow Peak Apparel', aliases: ['snow peak apparel'], group: ['japanese_mode'], tier: 'C', highValueCategories: ['outerwear', 'jackets'], region: 'JP' },
  { canonical: 'The RERACS', aliases: ['the reracs', 'reracs'], group: ['dark_artisan', 'japanese_mode'], tier: 'B', highValueCategories: ['coats', 'jackets'], region: 'JP' },
  { canonical: 'Kazuyuki Kumagai', aliases: ['kazuyuki kumagai'], group: ['dark_artisan'], tier: 'B', highValueCategories: ['jackets', 'pants', 'knitwear'], region: 'JP', demandScore: 70, rarityScore: 70, resaleScore: 69 },
  { canonical: 'N4', aliases: ['n4'], group: ['dark_artisan'], tier: 'C', highValueCategories: ['jackets', 'pants'], region: 'JP' },
  { canonical: 'Officine Creative', aliases: ['officine creative'], group: ['dark_artisan', 'leather_boots'], tier: 'B', highValueCategories: ['boots', 'leather', 'shoes'], region: 'EU' },
  { canonical: 'Guidi & Rosellini', aliases: ['guidi & rosellini', 'guidi and rosellini'], group: ['dark_artisan', 'leather_boots'], tier: 'B', highValueCategories: ['boots', 'leather', 'shoes'], region: 'EU' },
  { canonical: 'Dresscamp', aliases: ['dresscamp'], group: ['archive_cult', 'rock_glam'], tier: 'B', highValueCategories: ['jackets', 'coats'], region: 'JP' },
  { canonical: 'Devilock', aliases: ['devilock'], group: ['archive_cult', 'rock_glam'], tier: 'B', highValueCategories: ['jackets', 'hoodies'], region: 'JP' },
  { canonical: 'Factotum', aliases: ['factotum'], group: ['archive_cult'], tier: 'C', highValueCategories: ['jackets', 'pants'], region: 'JP' },
  { canonical: 'Diet Butcher Slim Skin', aliases: ['diet butcher slim skin', 'dbss'], group: ['archive_cult', 'rock_glam'], tier: 'B', highValueCategories: ['jackets', 'boots', 'pants'], region: 'JP' },
  { canonical: 'Jun Hashimoto', aliases: ['jun hashimoto'], group: ['archive_cult', 'rock_glam'], tier: 'C', highValueCategories: ['jackets', 'pants'], region: 'JP' },
  { canonical: 'Buffalo Bobs', aliases: ['buffalo bobs'], group: ['archive_cult', 'rock_glam'], tier: 'C', highValueCategories: ['jackets', 'boots'], region: 'JP' },
  { canonical: 'CIVARIZE', aliases: ['civarize'], group: ['archive_cult', 'rock_glam'], tier: 'D', highValueCategories: ['jackets', 'pants'], region: 'JP' },
  { canonical: 'Moonage Devilment', aliases: ['moonage devilment'], group: ['archive_cult', 'rock_glam'], tier: 'C', highValueCategories: ['jackets', 'boots'], region: 'JP' },
  { canonical: 'Black by VANQUISH', aliases: ['black by vanquish'], group: ['archive_cult', 'rock_glam'], tier: 'C', highValueCategories: ['jackets', 'pants'], region: 'JP' },
  { canonical: 'In The Attic', aliases: ['in the attic'], group: ['archive_cult', 'rock_glam'], tier: 'D', highValueCategories: ['jackets', 'pants'], region: 'JP' },
  { canonical: 'Vice Fairy', aliases: ['vice fairy'], group: ['archive_cult', 'rock_glam'], tier: 'D', highValueCategories: ['jackets', 'pants'], region: 'JP' },
  { canonical: 'AKM', aliases: ['akm'], group: ['archive_cult', 'rock_glam'], tier: 'C', highValueCategories: ['jackets', 'pants', 'leather'], region: 'JP' },
  { canonical: 'WJK', aliases: ['wjk'], group: ['archive_cult', 'rock_glam'], tier: 'C', highValueCategories: ['jackets', 'pants', 'leather'], region: 'JP' },
  { canonical: 'Kiryuyrik', aliases: ['kiryuyrik'], group: ['archive_cult', 'rock_glam'], tier: 'C', highValueCategories: ['jackets', 'boots'], region: 'JP' },
  { canonical: 'Glamb', aliases: ['glamb'], group: ['archive_cult', 'rock_glam'], tier: 'D', highValueCategories: ['jackets', 'pants'], region: 'JP' },
  { canonical: 'Saint Laurent Paris', aliases: ['saint laurent paris', 'slp'], group: ['high_demand'], tier: 'A', highValueCategories: ['jackets', 'boots', 'leather'], region: 'EU', demandScore: 86, rarityScore: 72, resaleScore: 84 },
  { canonical: 'Hedi Slimane Dior', aliases: ['hedi slimane dior', 'dior homme hedi', 'dior homme'], group: ['high_demand', 'archive_cult'], tier: 'A', highValueCategories: ['jackets', 'boots', 'leather'], region: 'EU', demandScore: 84, rarityScore: 78, resaleScore: 82 },
  { canonical: 'BAPE', aliases: ['bape', 'a bathing ape'], group: ['high_demand'], tier: 'B', highValueCategories: ['hoodies', 'jackets', 'accessories'], region: 'JP' },
  { canonical: 'A Bathing Ape', aliases: ['a bathing ape'], group: ['high_demand'], tier: 'B', highValueCategories: ['hoodies', 'jackets', 'accessories'], region: 'JP' },
  { canonical: 'Fragment Design', aliases: ['fragment design', 'fragment'], group: ['high_demand'], tier: 'B', highValueCategories: ['hoodies', 'jackets', 'accessories'], region: 'JP' },
  { canonical: 'Stussy', aliases: ['stussy'], group: ['high_demand'], tier: 'C', highValueCategories: ['hoodies', 'jackets'], region: 'US' },
  { canonical: 'Gunda', aliases: ['gunda'], group: ['leather_boots', 'high_demand'], tier: 'B', highValueCategories: ['accessories', 'jewelry'], region: 'JP' },
  { canonical: 'Bloody Mary Japan', aliases: ['bloody mary japan', 'bloody mary'], group: ['leather_boots'], tier: 'C', highValueCategories: ['accessories', 'jewelry'], region: 'JP' },
  { canonical: 'Justin Davis Japan', aliases: ['justin davis japan', 'justin davis'], group: ['leather_boots'], tier: 'C', highValueCategories: ['accessories', 'jewelry'], region: 'JP' },
  { canonical: 'Deal Design', aliases: ['deal design'], group: ['leather_boots'], tier: 'D', highValueCategories: ['accessories', 'jewelry'], region: 'JP' },
  { canonical: 'Royal Order Japan', aliases: ['royal order japan', 'royal order'], group: ['leather_boots'], tier: 'D', highValueCategories: ['accessories', 'jewelry'], region: 'JP' },
  { canonical: 'F.A.L Tokyo', aliases: ['f.a.l tokyo', 'fal tokyo'], group: ['leather_boots'], tier: 'D', highValueCategories: ['accessories', 'jewelry'], region: 'JP' },
  { canonical: 'Velvet Lounge', aliases: ['velvet lounge'], group: ['leather_boots'], tier: 'D', highValueCategories: ['accessories', 'jewelry'], region: 'JP' },
  { canonical: 'M’s Collection', aliases: ['m’s collection', "m's collection"], group: ['leather_boots'], tier: 'D', highValueCategories: ['accessories', 'jewelry'], region: 'JP' },
  { canonical: 'A&G Japan', aliases: ['a&g japan', 'a and g japan'], group: ['leather_boots'], tier: 'D', highValueCategories: ['accessories', 'jewelry'], region: 'JP' },
  { canonical: 'King Limo', aliases: ['king limo'], group: ['leather_boots'], tier: 'D', highValueCategories: ['accessories', 'jewelry'], region: 'JP' }
];

const EXPANDED_BRAND_SEEDS: GeneratedBrandSeed[] = [
  { canonical: 'Noir Kei Ninomiya', aliases: ['noir kei ninomiya', 'kei ninomiya'], group: ['japanese_mode'], tier: 'A', highValueCategories: ['coats', 'jackets', 'shirts'], region: 'JP' },
  { canonical: 'Takahiromiyashita The Soloist', aliases: ['takahiromiyashita the soloist', 'the soloist', 'soloist'], group: ['japanese_mode', 'archive_cult', 'high_demand'], tier: 'A', highValueCategories: ['jackets', 'coats', 'boots'], region: 'JP' },
  { canonical: 'N.Hoolywood', aliases: ['n.hoolywood', 'nhoolywood', 'n hoolywood'], group: ['japanese_mode'], tier: 'B', highValueCategories: ['jackets', 'coats', 'pants'], region: 'JP' },
  { canonical: 'White Mountaineering', aliases: ['white mountaineering'], group: ['japanese_mode'], tier: 'B', highValueCategories: ['outerwear', 'jackets', 'pants'], region: 'JP' },
  { canonical: 'Needles', aliases: ['needles'], group: ['japanese_mode', 'high_demand'], tier: 'B', highValueCategories: ['jackets', 'pants', 'shirts'], region: 'JP' },
  { canonical: 'Engineered Garments', aliases: ['engineered garments'], group: ['japanese_mode'], tier: 'B', highValueCategories: ['jackets', 'outerwear', 'shirts'], region: 'JP' },
  { canonical: 'South2 West8', aliases: ['south2 west8', 's2w8'], group: ['japanese_mode'], tier: 'B', highValueCategories: ['outerwear', 'jackets', 'pants'], region: 'JP' },
  { canonical: 'Hysteric Glamour', aliases: ['hysteric glamour'], group: ['japanese_mode', 'archive_cult'], tier: 'B', highValueCategories: ['jackets', 'hoodies', 'denim'], region: 'JP' },
  { canonical: 'Lad Musician', aliases: ['lad musician'], group: ['japanese_mode'], tier: 'B', highValueCategories: ['jackets', 'coats', 'pants'], region: 'JP' },
  { canonical: 'Name.', aliases: ['name.', 'name'], group: ['japanese_mode'], tier: 'C', highValueCategories: ['jackets', 'shirts', 'pants'], region: 'JP' },
  { canonical: 'beauty:beast', aliases: ['beauty:beast', 'beauty beast'], group: ['archive_cult'], tier: 'C', highValueCategories: ['jackets', 'hoodies', 'shirts'], region: 'JP' },
  { canonical: '20471120', aliases: ['20471120'], group: ['archive_cult'], tier: 'C', highValueCategories: ['jackets', 'hoodies', 'shirts'], region: 'JP' },
  { canonical: 'Na+H', aliases: ['na+h', 'nah'], group: ['archive_cult'], tier: 'C', highValueCategories: ['coats', 'jackets', 'skirts'], region: 'JP' },
  { canonical: 'Bounty Hunter', aliases: ['bounty hunter'], group: ['archive_cult', 'high_demand'], tier: 'C', highValueCategories: ['jackets', 'hoodies', 'accessories'], region: 'JP' },
  { canonical: 'Mastermind Japan', aliases: ['mastermind japan', 'mastermind'], group: ['archive_cult', 'high_demand'], tier: 'B', highValueCategories: ['jackets', 'hoodies', 'accessories'], region: 'JP' },
  { canonical: 'Le Grand Bleu', aliases: ['le grand bleu'], group: ['archive_cult'], tier: 'B', highValueCategories: ['jackets', 'boots', 'pants'], region: 'JP' },
  { canonical: 'If Six Was Nine', aliases: ['if six was nine', 'ifsixwasnine'], group: ['archive_cult'], tier: 'B', highValueCategories: ['jackets', 'boots', 'pants'], region: 'JP' },
  { canonical: 'Roen', aliases: ['roen'], group: ['archive_cult', 'rock_glam'], tier: 'C', highValueCategories: ['jackets', 'boots', 'leather'], region: 'JP' },
  { canonical: 'Roar', aliases: ['roar'], group: ['archive_cult', 'rock_glam'], tier: 'C', highValueCategories: ['jackets', 'pants', 'leather'], region: 'JP' },
  { canonical: 'Shellac', aliases: ['shellac'], group: ['archive_cult', 'rock_glam'], tier: 'C', highValueCategories: ['jackets', 'boots', 'leather'], region: 'JP' },
  { canonical: 'Tornado Mart', aliases: ['tornado mart'], group: ['archive_cult', 'rock_glam'], tier: 'D', highValueCategories: ['jackets', 'pants', 'boots'], region: 'JP' },
  { canonical: 'GalaabenD', aliases: ['galaabend'], group: ['archive_cult', 'rock_glam'], tier: 'C', highValueCategories: ['jackets', 'pants', 'boots'], region: 'JP' },
  { canonical: 'No ID.', aliases: ['no id.', 'no id'], group: ['archive_cult', 'rock_glam'], tier: 'D', highValueCategories: ['jackets', 'pants'], region: 'JP' },
  { canonical: 'Royal Flash', aliases: ['royal flash'], group: ['archive_cult', 'rock_glam'], tier: 'D', highValueCategories: ['jackets', 'boots'], region: 'JP' },
  { canonical: 'Varosh', aliases: ['varosh'], group: ['archive_cult', 'rock_glam'], tier: 'D', highValueCategories: ['jackets', 'pants'], region: 'JP' },
  { canonical: 'Dirk Bikkembergs', aliases: ['dirk bikkembergs', 'bikkembergs'], group: ['high_demand'], tier: 'B', highValueCategories: ['boots', 'jackets', 'pants'], region: 'EU' },
  { canonical: 'Maison Martin Margiela', aliases: ['maison martin margiela'], group: ['high_demand'], tier: 'A', highValueCategories: ['coats', 'jackets', 'boots'], region: 'EU' },
  { canonical: 'MM6', aliases: ['mm6', 'mm6 maison margiela'], group: ['high_demand'], tier: 'B', highValueCategories: ['coats', 'jackets', 'bags'], region: 'EU' },
  { canonical: 'DRKSHDW', aliases: ['drkshdw', 'rick owens drkshdw'], group: ['high_demand'], tier: 'S', highValueCategories: ['jackets', 'pants', 'hoodies'], region: 'EU' },
  { canonical: 'Jil Sander', aliases: ['jil sander'], group: ['high_demand'], tier: 'B', highValueCategories: ['coats', 'jackets', 'pants'], region: 'EU' },
  { canonical: 'Neighborhood', aliases: ['neighborhood'], group: ['high_demand'], tier: 'B', highValueCategories: ['jackets', 'hoodies', 'pants'], region: 'JP' },
  { canonical: 'WTAPS', aliases: ['wtaps'], group: ['high_demand'], tier: 'B', highValueCategories: ['jackets', 'pants', 'hoodies'], region: 'JP' },
  { canonical: 'Gunda', aliases: ['gunda'], group: ['leather_boots', 'high_demand'], tier: 'B', highValueCategories: ['accessories', 'jewelry'], region: 'JP' },
  { canonical: 'Forme d’Expression', aliases: ['forme d’expression'], group: ['dark_artisan'], tier: 'A', highValueCategories: ['jackets', 'coats', 'pants'], region: 'EU' },
  { canonical: 'Guidi Rosellini', aliases: ['guidi rosellini'], group: ['dark_artisan', 'leather_boots'], tier: 'B', highValueCategories: ['boots', 'leather', 'shoes'], region: 'EU' },
  { canonical: 'Maison Margiela Artisanal', aliases: ['maison margiela artisanal', 'margiela artisanal'], group: ['high_demand'], tier: 'S', highValueCategories: ['jackets', 'coats', 'leather'], region: 'EU' },
  { canonical: 'Paul Harnden', aliases: ['paul harnden'], group: ['dark_artisan'], tier: 'A', highValueCategories: ['coats', 'jackets', 'pants'], region: 'EU' },
  { canonical: 'Bergfabel', aliases: ['bergfabel'], group: ['dark_artisan'], tier: 'B', highValueCategories: ['coats', 'jackets'], region: 'EU' },
  { canonical: 'Album Di Famiglia', aliases: ['album di famiglia'], group: ['dark_artisan'], tier: 'B', highValueCategories: ['coats', 'jackets'], region: 'EU' },
  { canonical: 'Uma Wang', aliases: ['uma wang'], group: ['dark_artisan'], tier: 'B', highValueCategories: ['coats', 'jackets', 'pants'], region: 'INTL' },
  { canonical: 'Archivio J.M. Ribot', aliases: ['archivio j.m. ribot', 'jm ribot'], group: ['dark_artisan'], tier: 'B', highValueCategories: ['jackets', 'coats'], region: 'EU' },
  { canonical: 'Taichi Murakami', aliases: ['taichi murakami'], group: ['dark_artisan'], tier: 'B', highValueCategories: ['jackets', 'coats', 'leather'], region: 'JP' },
  { canonical: 'By Walid', aliases: ['by walid'], group: ['dark_artisan'], tier: 'B', highValueCategories: ['jackets', 'coats'], region: 'EU' },
  { canonical: 'Yang Li', aliases: ['yang li'], group: ['dark_artisan'], tier: 'B', highValueCategories: ['jackets', 'coats', 'boots'], region: 'EU' },
  { canonical: 'Uma Wang Uomo', aliases: ['uma wang uomo'], group: ['dark_artisan'], tier: 'C', highValueCategories: ['coats', 'jackets'], region: 'INTL' },
  { canonical: 'Petrosolaum', aliases: ['petrosolaum'], group: ['leather_boots'], tier: 'B', highValueCategories: ['boots', 'leather', 'shoes'], region: 'JP' },
  { canonical: 'Marsèll', aliases: ['marsell'], group: ['leather_boots'], tier: 'B', highValueCategories: ['boots', 'leather', 'bags'], region: 'EU' },
  { canonical: 'Officine Creative Italia', aliases: ['officine creative italia'], group: ['leather_boots'], tier: 'C', highValueCategories: ['boots', 'leather', 'shoes'], region: 'EU' },
  { canonical: 'Kenzo Takada Archive', aliases: ['kenzo takada archive', 'old kenzo'], group: ['archive_cult'], tier: 'C', highValueCategories: ['jackets', 'coats'], region: 'JP' },
  { canonical: 'Homme Plissé Issey Miyake', aliases: ['homme plisse issey miyake', 'homme plisse'], group: ['japanese_mode', 'high_demand'], tier: 'A', highValueCategories: ['pants', 'jackets', 'coats'], region: 'JP' },
  { canonical: 'Issey Miyake Men', aliases: ['issey miyake men'], group: ['japanese_mode'], tier: 'A', highValueCategories: ['coats', 'jackets', 'pants'], region: 'JP' },
  { canonical: 'Comme des Garçons Homme', aliases: ['comme des garcons homme', 'cdg homme'], group: ['japanese_mode'], tier: 'A', highValueCategories: ['jackets', 'coats', 'shirts'], region: 'JP' },
  { canonical: 'Visvim FBT', aliases: ['visvim fbt'], group: ['high_demand'], tier: 'B', highValueCategories: ['shoes', 'boots'], region: 'JP' },
  { canonical: 'Attachment Kazuyuki Kumagai', aliases: ['attachment kazuyuki kumagai'], group: ['dark_artisan'], tier: 'B', highValueCategories: ['jackets', 'pants', 'knitwear'], region: 'JP' },
  { canonical: 'Backbone', aliases: ['backbone'], group: ['archive_cult', 'rock_glam'], tier: 'C', highValueCategories: ['jackets', 'pants', 'boots'], region: 'JP' },
  { canonical: '14th Addiction', aliases: ['14th addiction'], group: ['archive_cult', 'rock_glam'], tier: 'C', highValueCategories: ['jackets', 'leather', 'boots'], region: 'JP' },
  { canonical: 'Roen x Semantic Design', aliases: ['roen semantic design'], group: ['archive_cult', 'rock_glam'], tier: 'D', highValueCategories: ['jackets', 'pants'], region: 'JP' },
  { canonical: 'Hideaways', aliases: ['hideaways'], group: ['archive_cult', 'rock_glam'], tier: 'D', highValueCategories: ['jackets', 'pants'], region: 'JP' },
  { canonical: 'PPFM', aliases: ['ppfm'], group: ['archive_cult'], tier: 'D', highValueCategories: ['jackets', 'pants'], region: 'JP' },
  { canonical: 'Semantic Design', aliases: ['semantic design'], group: ['archive_cult', 'rock_glam'], tier: 'D', highValueCategories: ['jackets', 'pants'], region: 'JP' },
  { canonical: 'Share Spirit', aliases: ['share spirit'], group: ['archive_cult', 'rock_glam'], tier: 'C', highValueCategories: ['jackets', 'boots', 'pants'], region: 'JP' },
  { canonical: 'Goa', aliases: ['goa'], group: ['archive_cult'], tier: 'D', highValueCategories: ['jackets', 'pants'], region: 'JP' },
  { canonical: 'Lounge Lizard', aliases: ['lounge lizard'], group: ['archive_cult', 'rock_glam'], tier: 'C', highValueCategories: ['jackets', 'pants', 'boots'], region: 'JP' },
  { canonical: 'Factotum Femme', aliases: ['factotum femme'], group: ['archive_cult'], tier: 'D', highValueCategories: ['jackets', 'coats'], region: 'JP' },
  { canonical: 'GalaabenD Femme', aliases: ['galaabend femme'], group: ['archive_cult', 'rock_glam'], tier: 'D', highValueCategories: ['jackets', 'coats'], region: 'JP' }
];

const CORE_CANONICALS = new Set(CORE_BRAND_CATALOG.map((brand) => brand.canonical));
const GENERATED_BRANDS = [...GENERATED_BRAND_SEEDS, ...EXPANDED_BRAND_SEEDS]
  .filter((seed, index, allSeeds) =>
    !CORE_CANONICALS.has(seed.canonical)
      && allSeeds.findIndex((entry) => entry.canonical === seed.canonical) === index
  )
  .map(buildGeneratedBrand);

export const BRAND_CATALOG: BrandEntry[] = [...CORE_BRAND_CATALOG, ...GENERATED_BRANDS];

export const BRANDS = BRAND_CATALOG.map((brand) => brand.canonical);

function normalizeBrandTextLocal(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[’`´]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^\w\s'.+\-()]/g, '')
    .normalize('NFC');
}

function hasBoundary(haystack: string, needle: string): boolean {
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i');
  return pattern.test(haystack);
}

const LOCAL_BRAND_ALIASES: Record<string, string> = Object.fromEntries(
  BRAND_CATALOG.flatMap((brand) => brand.aliases.map((alias) => [normalizeBrandTextLocal(alias), brand.canonical]))
);

export function detectBrandInText(input: string): string | null {
  const normalized = normalizeBrandTextLocal(input);
  let bestMatch: { canonical: string; length: number } | null = null;

  for (const [alias, canonical] of Object.entries(LOCAL_BRAND_ALIASES)) {
    if (alias.length < 3) continue;
    const matched = alias.length <= 3 ? hasBoundary(normalized, alias) : normalized.includes(alias);
    if (!matched) continue;
    if (!bestMatch || alias.length > bestMatch.length) {
      bestMatch = { canonical, length: alias.length };
    }
  }

  return bestMatch?.canonical ?? null;
}
