// Scaffold Eleventy config — minimal and dependency-free. Basepage runs this with
// its own bundled Eleventy and layers the wiki features (wikilinks + backlinks)
// on top from the manifest. Don't import plugins here.
export default function (eleventyConfig) {
  // CSS live-reload needs BOTH of these.
  eleventyConfig.addPassthroughCopy("src/css");
  eleventyConfig.addWatchTarget("./src/css/");
  eleventyConfig.addWatchTarget("./basepage.json");

  // Every note in src/notes/ gets the "note" tag (see notes/notes.json).
  eleventyConfig.addCollection("notes", (api) =>
    api
      .getFilteredByTag("note")
      .sort((a, b) => (a.data.title || "").localeCompare(b.data.title || "")),
  );

  return {
    dir: { input: "src", output: "_site", includes: "_includes", data: "_data" },
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
  };
}
