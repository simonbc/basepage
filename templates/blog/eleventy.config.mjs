// Scaffold Eleventy config — deliberately minimal and dependency-free.
// Basepage runs this with its OWN bundled Eleventy and layers the manifest's
// opt-in features (blog, rss, syntax-highlight, …) on top. The posts collection
// and date filters come from the "blog" feature — don't redefine them here.
export default function (eleventyConfig) {
  // CSS live-reload needs BOTH of these. Drop either and edits stop reloading.
  eleventyConfig.addPassthroughCopy("src/css");
  eleventyConfig.addWatchTarget("./src/css/");
  // Reflect manifest edits (title, tagline) into the running preview.
  eleventyConfig.addWatchTarget("./basepage.json");

  return {
    dir: { input: "src", output: "_site", includes: "_includes", data: "_data" },
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
  };
}
