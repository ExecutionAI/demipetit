// Petit Demi — Product catalog
// All prices in EUR, sourced from Demi's official menu

export const CAKE_SIZES = [
  { id: '7_single', label: '7" Single layer', note: '6–8 people',  price: 35 },
  { id: '7_double', label: '7" Double layer', note: '8–10 people', price: 45 },
  { id: '7_triple', label: '7" Triple layer', note: '12+ people',  price: 65 },
  { id: '9_single', label: '9" Single layer', note: '10–12 people',price: 40 },
];

export const FLAVORS = [
  'Carrot',
  'Chocolate',
  'Red Velvet',
  'Lemon Blueberry',
  'Cookies & Cream',
  'Lemon Raspberry',
  'Vanilla',
  'Hummingbird',
  'Vanilla Confetti',
  'Coconut Vanilla',
  'Lemon Pistachio',
];

export const FILLINGS = [
  { id: 'smb_vanilla',  label: 'Swiss Meringue Buttercream — Vanilla',         surcharge: 0   },
  { id: 'smb_choc',     label: 'Swiss Meringue Buttercream — Chocolate',        surcharge: 0   },
  { id: 'smb_white',    label: 'Swiss Meringue Buttercream — White Chocolate',  surcharge: 0   },
  { id: 'cream_cheese', label: 'Cream Cheese',                                  surcharge: 1.5 },
  { id: 'choc_cc',      label: 'Chocolate Cream Cheese',                        surcharge: 1.5 },
  { id: 'curd_lemon',   label: 'Lemon Curd',                                    surcharge: 0   },
  { id: 'curd_passion', label: 'Passionfruit Curd',                             surcharge: 0   },
  { id: 'jam_rasp',     label: 'Raspberry Jam',                                 surcharge: 0   },
  { id: 'jam_blueberry',label: 'Blueberry Jam',                                 surcharge: 0   },
  { id: 'jam_strawb',   label: 'Strawberry Jam',                                surcharge: 0   },
  { id: 'fresh_fruit',  label: 'Fresh Fruit',                                   surcharge: 0   },
];

export const OTHER_PRODUCTS = [
  {
    id: 'cupcakes_6',
    type: 'cupcakes',
    label: 'Cupcakes',
    note: '6 pieces',
    price: 21,
    description: 'Light, fluffy cupcakes in any of our signature flavours.',
  },
  {
    id: 'cupcakes_12',
    type: 'cupcakes',
    label: 'Cupcakes',
    note: '12 pieces',
    price: 42,
    description: 'A full dozen — perfect for a party spread.',
  },
  {
    id: 'cheesecake',
    type: 'cheesecake',
    label: 'Cheesecake',
    note: '10 people',
    price: 45,
    flavors: ['Lemon', 'White Chocolate Raspberry', 'Vanilla', 'Chocolate', 'Lemon Meringue (+€2)', 'Brownie Bottom (+€2)'],
    description: 'Silky, creamy cheesecakes with a buttery biscuit base.',
  },
  {
    id: 'brownie',
    type: 'brownie',
    label: 'Brownie',
    note: '12 pieces',
    price: 30,
    flavors: ['Chocolate Chunk', 'Cheesecake (+€2)', 'Blondie', 'Chocolate & Nuts', 'Oreo'],
    description: 'Dense, fudgy brownies — the kind you can\'t stop at one.',
  },
  {
    id: 'tart',
    type: 'tart',
    label: 'Tart',
    note: '8–10 people',
    price: 40,
    flavors: ['Lemon Meringue', 'Mango Cream', 'Strawberry', 'Chocolate Caramel', 'Fruit'],
    description: 'Elegant tarts with a crisp pastry shell and luscious fillings.',
  },
  {
    id: 'cookies_10',
    type: 'cookies',
    label: 'Cookies',
    note: '10 pieces',
    price: 35,
    flavors: ['Chocolate Chip', 'Caramel Chocolate Chip', 'White Choc Macadamia', 'Chocolate Pistachio', 'White Choc Raspberry'],
    description: 'Thick, bakery-style cookies with golden edges and gooey centres.',
  },
];

export const OCCASIONS = [
  'Birthday',
  'Anniversary',
  'Baby Shower',
  'Wedding',
  'Corporate',
  'Just Because',
  'Other',
];
