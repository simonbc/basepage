// Scaffold Eleventy config — minimal and dependency-free. Basepage runs this with
// its own bundled Eleventy. Don't import plugins here (no node_modules); enable
// features in basepage.json instead.
export default function (eleventyConfig) {
  // CSS live-reload needs BOTH of these.
  eleventyConfig.addPassthroughCopy("src/css");
  eleventyConfig.addWatchTarget("./src/css/");
  eleventyConfig.addWatchTarget("./basepage.json");

  return {
    dir: { input: "src", output: "_site", includes: "_includes", data: "_data" },
    htmlTemplateEngine: "njk",
  };
}
