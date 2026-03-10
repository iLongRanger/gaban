const KNOWN_CHAINS = [
  'mcdonald\'s', 'starbucks', 'tim hortons', 'subway', 'burger king',
  'wendy\'s', 'a&w', 'kfc', 'popeyes', 'taco bell', 'pizza hut',
  'domino\'s', 'papa john\'s', 'little caesars', 'five guys',
  'chipotle', 'panda express', 'chick-fil-a', 'dairy queen',
  'dunkin\'', 'baskin-robbins', 'cold stone', 'boston pizza',
  'the keg', 'earls', 'cactus club', 'joey', 'white spot',
  'denny\'s', 'ihop', 'applebee\'s', 'olive garden', 'red lobster',
  'swiss chalet', 'harvey\'s', 'mary brown\'s', 'church\'s chicken',
  'arby\'s', 'sonic', 'jack in the box', 'carl\'s jr',
  'wingstop', 'buffalo wild wings', 'hooters', 'red robin',
  'montana\'s', 'milestones', 'moxie\'s', 'original joe\'s',
  'panera bread', 'nando\'s', 'freshii', 'mucho burrito',
  'qdoba', 'el pollo loco', 'raising cane\'s',
  'anytime fitness', 'goodlife fitness', 'planet fitness',
  'gold\'s gym', 'orangetheory', 'f45 training', 'curves',
  'snap fitness', 'world gym', 'fit4less',
  '7-eleven', 'circle k', 'shoppers drug mart', 'london drugs',
  'walmart', 'costco', 'canadian tire', 'home depot', 'lowe\'s',
  'staples', 'best buy', 'dollarama', 'winners', 'marshalls',
  'value village', 'salvation army thrift',
  'rexall', 'jean coutu', 'pharmasave',
  'kumon', 'sylvan learning', 'oxford learning',
  'regus', 'wework', 'spaces',
  'servicemaster', 'jani-king', 'coverall', 'jan-pro',
  'molly maid', 'merry maids', 'maid brigade'
];

export function isChain(businessName) {
  if (!businessName) return false;
  const lower = businessName.toLowerCase();
  return KNOWN_CHAINS.some(chain => lower.includes(chain));
}
