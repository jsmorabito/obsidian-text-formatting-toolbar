import esbuild from "esbuild";
import process from "process";
import builtins from "builtin-modules";
import { sassPlugin } from "esbuild-sass-plugin";
import { copyFileSync } from "fs";

const prod = process.argv[2] === "production";

const buildOptions = {
	entryPoints: ["src/main.ts"],
	bundle: true,
	external: [
		"obsidian",
		"electron",
		"@codemirror/autocomplete",
		"@codemirror/commands",
		"@codemirror/language",
		"@codemirror/state",
		"@codemirror/view",
		...builtins,
	],
	format: "cjs",
	target: "es2017",
	logLevel: "info",
	sourcemap: prod ? false : "inline",
	minify: prod,
	treeShaking: true,
	outfile: "main.js",
	plugins: [
		sassPlugin(),
		{
			name: "copy-css",
			setup(build) {
				build.onEnd(() => {
					try {
						copyFileSync("main.css", "styles.css");
					} catch (e) {
						console.error("Failed to copy main.css → styles.css:", e);
					}
				});
			},
		},
	],
};

if (prod) {
	esbuild.build(buildOptions).catch(() => process.exit(1));
} else {
	esbuild
		.context(buildOptions)
		.then((ctx) => ctx.watch())
		.catch(() => process.exit(1));
}
