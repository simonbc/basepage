// Scaffold Eleventy config — deliberately minimal and dependency-free.
// Basepage runs this with its OWN bundled Eleventy and layers the manifest's
// opt-in plugins (rss, syntax-highlight, …) on top. Don't import plugins here:
// the scaffold has no node_modules. Edit freely — design-by-prompt lives here.
export default function (eleventyConfig) {
  // CSS live-reload needs BOTH of these. Drop either and edits stop reloading.
  eleventyConfig.addPassthroughCopy("src/css");
  eleventyConfig.addWatchTarget("./src/css/");
  // Reflect manifest edits (title, tagline) into the running preview.
  eleventyConfig.addWatchTarget("./basepage.json");

  // Newest-first posts collection. Items get the "post" tag from posts/posts.json.
  eleventyConfig.addCollection("posts", (api) =>
    api.getFilteredByTag("post").sort((a, b) => b.date - a.date),
  );

  // Human + machine date formatting, no dependencies.
  eleventyConfig.addFilter("readableDate", (d) =>
    new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
  );
  eleventyConfig.addFilter("isoDate", (d) => new Date(d).toISOString().slice(0, 10));

  return {
    dir: { input: "src", output: "_site", includes: "_includes", data: "_data" },
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
  };
}
