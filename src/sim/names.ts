// All names are fictional. Places are invented so no real school is implied.

export const FIRST_NAMES = [
  'Aaron', 'Abe', 'Adrian', 'Andre', 'Amari', 'Ashton', 'Bennett', 'Blake', 'Brandon', 'Bryce', 'Caleb', 'Cam', 'Carter',
  'Cedric', 'Chase', 'Cole', 'Collin', 'Corey', 'Dalton', 'Damon', 'Dante', 'Darius', 'Dawson', 'Deandre', 'Desmond',
  'Devin', 'Dominic', 'Drew', 'Dylan', 'Eli', 'Elijah', 'Emeka', 'Eric', 'Ethan', 'Felix', 'Gabe', 'Garrett', 'Grant',
  'Hakeem', 'Hayden', 'Isaac', 'Isaiah', 'Jabari', 'Jace', 'Jalen', 'Jamal', 'Jared', 'Javon', 'Jaylen', 'Jesse',
  'Joel', 'Jonah', 'Jordan', 'Josiah', 'Julian', 'Justin', 'Kade', 'Kai', 'Keegan', 'Kendall', 'Kenji', 'Keon',
  'Kobe', 'Lamar', 'Landon', 'Lars', 'Leon', 'Levi', 'Logan', 'Luca', 'Malik', 'Marcus', 'Mason', 'Mateo', 'Micah',
  'Miles', 'Moses', 'Nate', 'Nico', 'Noah', 'Omar', 'Oscar', 'Owen', 'Pierce', 'Quentin', 'Quincy', 'Rafael', 'Reed',
  'Reggie', 'Rhys', 'Roman', 'Ruben', 'Ryan', 'Sam', 'Santiago', 'Seth', 'Silas', 'Simeon', 'Tariq', 'Terrence', 'Theo',
  'Tobias', 'Trey', 'Tristan', 'Tyler', 'Tyrese', 'Victor', 'Wade', 'Wes', 'Xavier', 'Yusuf', 'Zach', 'Zion', 'Ade',
  'Bastian', 'Cyrus', 'Dario', 'Emil', 'Femi', 'Gideon', 'Hugo', 'Ira', 'Jonas', 'Kofi', 'Mikael', 'Nolan', 'Otto',
];

export const LAST_NAMES = [
  'Abbott', 'Adeyemi', 'Alston', 'Ambrose', 'Archer', 'Baker', 'Barnes', 'Bell', 'Bishop', 'Blackwell', 'Booker',
  'Bowman', 'Brooks', 'Burke', 'Calloway', 'Carver', 'Castillo', 'Chambers', 'Clarke', 'Coleman', 'Cross', 'Dawkins',
  'Delgado', 'Dixon', 'Doyle', 'Drummond', 'Dunn', 'Ellis', 'Emery', 'Fields', 'Fleming', 'Ford', 'Foster', 'Gaines',
  'Garrison', 'Gibbs', 'Graves', 'Griffin', 'Hale', 'Hammond', 'Harper', 'Hayes', 'Hendrix', 'Holloway', 'Hughes',
  'Ingram', 'Irving', 'Jefferson', 'Keane', 'Kimura', 'Knox', 'Lambert', 'Langston', 'Lowe', 'Maddox', 'Mallory',
  'Marsh', 'Mercer', 'Monroe', 'Morrow', 'Nash', 'Nwosu', 'Okafor', 'Oliver', 'Osei', 'Pace', 'Park', 'Pearson',
  'Pruitt', 'Quinn', 'Ramsey', 'Reyes', 'Rhodes', 'Riddick', 'Rivers', 'Rollins', 'Sampson', 'Santos', 'Sawyer',
  'Shaw', 'Sinclair', 'Slater', 'Stokes', 'Sutton', 'Talley', 'Tate', 'Thornton', 'Townsend', 'Underwood', 'Vance',
  'Vaughn', 'Wallace', 'Ward', 'Webb', 'Whitfield', 'Wilder', 'Winslow', 'Wolfe', 'Yates', 'York', 'Zeller', 'Lindqvist',
  'Petrovic', 'Haddad', 'Mensah', 'Ferreira', 'Kowalski', 'Bauer', 'Duval', 'Achebe', 'Moreau', 'Tanaka', 'Novak',
];

export const REGIONS = ['Northeast', 'Mid-Atlantic', 'Southeast', 'Gulf', 'Midwest', 'Plains', 'Mountain', 'Pacific'];

/** Invented place names grouped loosely by region. */
export const PLACES: Record<string, string[]> = {
  Northeast: ['Harrowgate', 'Port Ellery', 'Marblehead Falls', 'Wexley', 'North Cairn', 'Stonebridge', 'Aldenmoor', 'Kestrel Bay', 'Quarry Hill', 'Brightwater', 'Ashcombe', 'Glenvale', 'Tamsin'],
  'Mid-Atlantic': ['Calder', 'Fairhaven', 'Montclave', 'Bellmere', 'Ridgecrest', 'Larkspur', 'Holloway Springs', 'Dunmore Hill', 'Thistlewood', 'Corbin Ford', 'Wyndham Gap', 'Marrow'],
  Southeast: ['Magnolia Ridge', 'Palmetto Bend', 'Savoy', 'Cypress Point', 'Live Oak', 'Briarwood', 'Tupelo Creek', 'Laurel Valley', 'Sweetgum', 'Port Royale', 'Okonee', 'Jessamine'],
  Gulf: ['Bayou Teche City', 'Corriente', 'Pelican Shoals', 'Sabine Cross', 'Galvez', 'Matagorda Bluff', 'Fort Delamar', 'Lake Charlotte', 'Saltmarsh', 'Rio Verde', 'Tidewater', 'Mobray'],
  Midwest: ['Lakeport', 'Fennimore', 'Prairie Hill', 'Cedar Rapids Junction', 'Brackett', 'Kettle Moraine', 'Wabash Falls', 'Elmhurst Glen', 'Ottawa Bend', 'Muskeg', 'Sandusky Shore', 'Hollis'],
  Plains: ['Red Mesa', 'Cimarron', 'Big Sioux', 'Platte Crossing', 'Wichita Flats', 'Pawnee Rock', 'Dodge Hollow', 'Flint Hills', 'Medicine Lodge', 'Badger Creek', 'Loup Valley', 'Ponca'],
  Mountain: ['Silverpeak', 'Canyon Rim', 'Highpoint', 'Juniper', 'Granite Pass', 'Aspen Falls', 'Red Butte', 'Sawtooth', 'Teller', 'Bridger', 'Mesa Alta', 'Coldwater'],
  Pacific: ['Seacliff', 'Redwood Shore', 'Cascade', 'Point Avila', 'Sonora Valley', 'Marisol', 'Tamarack', 'Harbor Pines', 'Kelp Bay', 'Westhaven', 'Olympus Ridge', 'Santa Ines'],
};

export const MASCOTS = [
  'Owls', 'Foxes', 'Ravens', 'Herons', 'Bison', 'Stags', 'Coyotes', 'Wolves', 'Hornets', 'Mariners', 'Pilots',
  'Rangers', 'Highlanders', 'Pioneers', 'Comets', 'Storm', 'Tide', 'Thunder', 'Lynx', 'Otters', 'Badgers', 'Falcons',
  'Kestrels', 'Ospreys', 'Mustangs', 'Bobcats', 'Golden Elk', 'Blue Herons', 'Red Hawks', 'Ironmen', 'Quakers',
  'Miners', 'Lumberjacks', 'Gators', 'Pelicans', 'Marlins', 'Rattlers', 'Scorpions', 'Condors', 'Sentinels', 'Monarchs',
  'Knights', 'Captains', 'Voyagers', 'Cardinals', 'Wildcats', 'Panthers', 'Grizzlies', 'Sea Lions', 'Firebirds',
];

export const SCHOOL_PATTERNS = ['{p} State', 'University of {p}', '{p}', '{p} Tech', '{p} College', 'Northern {p}', '{p} A&M', '{p} Christian', 'Saint {p}'];

export const CONFERENCE_NAMES: { name: string; abbr: string }[] = [
  { name: 'Continental Athletic Conference', abbr: 'CAC' },
  { name: 'Heartland League', abbr: 'HL' },
  { name: 'Coastal Ten', abbr: 'C10' },
  { name: 'Frontier Conference', abbr: 'FRON' },
  { name: 'Atlantic Metro', abbr: 'AMC' },
  { name: 'Summit Athletic', abbr: 'SAC' },
  { name: 'Great Rivers Conference', abbr: 'GRC' },
  { name: 'Pacific Crest League', abbr: 'PCL' },
  { name: 'Lone Prairie Conference', abbr: 'LPC' },
  { name: 'Mid-Country Union', abbr: 'MCU' },
];

export const COLORS: [string, string][] = [
  ['#7a1f2b', '#f2c14e'], ['#1f3a7a', '#e6e6e6'], ['#0f5c3a', '#f5d76e'], ['#3d1f6e', '#f2a541'], ['#b23a10', '#1d1d1d'],
  ['#14425c', '#9ad1d4'], ['#5e1224', '#cfcfcf'], ['#2b2b2b', '#e0a21b'], ['#0a6e8a', '#ffffff'], ['#8a5a0a', '#2a1a05'],
  ['#145c14', '#ffffff'], ['#902020', '#ffffff'], ['#203a90', '#d0a030'], ['#5a3a1a', '#e8d8b0'], ['#6a1a6a', '#e0e0e0'],
  ['#004b49', '#d4af37'], ['#c25b00', '#003049'], ['#1b4332', '#b7e4c7'], ['#540b0e', '#e09f3e'], ['#22223b', '#c9ada7'],
];

export const INJURIES: { name: string; min: number; max: number }[] = [
  { name: 'Sprained ankle', min: 1, max: 3 },
  { name: 'Hamstring strain', min: 1, max: 4 },
  { name: 'Knee bruise', min: 1, max: 2 },
  { name: 'Back spasms', min: 1, max: 2 },
  { name: 'Concussion protocol', min: 1, max: 2 },
  { name: 'Broken finger', min: 2, max: 5 },
  { name: 'Stress reaction (foot)', min: 3, max: 8 },
  { name: 'Torn meniscus', min: 5, max: 12 },
  { name: 'Shoulder sprain', min: 2, max: 4 },
];

export const COACH_BACKGROUNDS = [
  'Former college point guard',
  'High school coaching legend',
  'Video coordinator turned recruiter',
  'Analytics department',
  'Overseas pro, then assistant',
  'Junior college head coach',
];
