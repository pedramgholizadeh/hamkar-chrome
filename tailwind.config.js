/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./extension/newtab.html', './extension/js/**/*.js'],
  theme: {
    extend: {
      colors: {
        // Modern SaaS dark palette
        ink: '#07080F',      // page background — near-black blue
        navy: '#151A2C',     // glass panel tint base
        steel: '#2B3143',    // lines / hover surfaces
        cream: '#E9EBF4',    // body text
        vanilla: '#FFFFFF',  // headings
        accent: '#8B5CF6',   // primary — violet
        cyan: '#22D3EE',     // secondary accent — gradients
        mint: '#34D399',     // success
      },
      fontFamily: {
        sans: ['Vazirmatn', 'Segoe UI', 'Tahoma', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
