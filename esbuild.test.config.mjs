import esbuild from "esbuild";
import path from "node:path";

const aliasObsidian = {
  name: "alias-obsidian",
  setup(build) {
    build.onResolve({ filter: /^obsidian$/ }, () => ({
      path: path.resolve("test/obsidian-stub.ts"),
    }));
  },
};

const aliasLlmForEditorActions = {
  name: "alias-llm-for-editor-actions",
  setup(build) {
    build.onResolve({ filter: /^\.\/llm$/ }, (args) => {
      if (args.importer.includes("editor-actions")) {
        return { path: path.resolve("test/llm-stub.ts") };
      }
      return undefined;
    });
  },
};

await esbuild.build({
  entryPoints: ["test/all.test.ts"],
  bundle: true,
  format: "cjs",
  platform: "node",
  target: "node18",
  outfile: "test/all.test.cjs",
  plugins: [aliasObsidian, aliasLlmForEditorActions],
  logLevel: "info",
});
