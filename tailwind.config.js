/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./extension/newtab.html', './extension/js/**/*.js', './landing/index.html'],
  theme: {
    extend: {
      colors: {
        // Hamkar palette
        ink: '#030164',     // deep night — base background
        cream: '#FCF9EA',   // primary text
        vanilla: '#FFFAD3', // secondary text / highlights
        navy: '#253C6D',    // glass panel tint
        steel: '#455B8A',   // muted borders / hover
        gold: '#FCAD38',    // accent
        sand: '#FFFAD3',    // alias of vanilla (landing)
        slate2: '#455B8A',  // alias of steel (landing)
      },
      fontFamily: {
        vazir: ['Vazirmatn', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
