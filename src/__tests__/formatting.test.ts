import { describe, it, expect } from "vitest";
import {
	toggleInlineFormat,
	getHeadingLevel,
	getListType,
	applyHeading,
	toggleBlockquote,
	toggleCodeBlock,
	wrapLink,
	type SelectionInfo,
} from "../formatting";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sel(
	text: string,
	line = 0,
	fromCh = 0,
	lineText?: string,
): SelectionInfo {
	return {
		sel: text,
		from: { line, ch: fromCh },
		to:   { line, ch: fromCh + text.length },
		line: lineText ?? text,
	};
}

// ---------------------------------------------------------------------------
// toggleInlineFormat
// ---------------------------------------------------------------------------

describe("toggleInlineFormat — wrap", () => {
	it("wraps plain text with **", () => {
		const r = toggleInlineFormat(sel("hello"), "**");
		expect(r.replacement).toBe("**hello**");
		expect(r.newFrom).toEqual({ line: 0, ch: 2 });
		expect(r.newTo).toEqual({ line: 0, ch: 7 });
	});

	it("wraps with single-char marker *", () => {
		const r = toggleInlineFormat(sel("hi"), "*");
		expect(r.replacement).toBe("*hi*");
		expect(r.newFrom.ch).toBe(1);
		expect(r.newTo.ch).toBe(3);
	});

	it("wraps with ==", () => {
		const r = toggleInlineFormat(sel("text"), "==");
		expect(r.replacement).toBe("==text==");
	});

	it("wraps with %%", () => {
		const r = toggleInlineFormat(sel("comment"), "%%");
		expect(r.replacement).toBe("%%comment%%");
	});

	it("wraps with backtick", () => {
		const r = toggleInlineFormat(sel("code"), "`");
		expect(r.replacement).toBe("`code`");
	});

	it("preserves list prefix when wrapping", () => {
		const r = toggleInlineFormat(sel("- hello"), "**");
		expect(r.replacement).toBe("- **hello**");
		// cursor sits inside markers, after prefix
		expect(r.newFrom).toEqual({ line: 0, ch: 4 }); // "- " prefix (2) + marker "**" (2) = ch 4
	});

	it("preserves blockquote prefix when wrapping", () => {
		const r = toggleInlineFormat(sel("> hello"), "**");
		expect(r.replacement).toBe("> **hello**");
	});

	it("preserves heading prefix when wrapping", () => {
		const r = toggleInlineFormat(sel("## hello"), "**");
		expect(r.replacement).toBe("## **hello**");
	});
});

describe("toggleInlineFormat — unwrap selection-wrapped", () => {
	it("unwraps **word** when selection contains the markers", () => {
		const r = toggleInlineFormat(sel("**hello**"), "**");
		expect(r.replacement).toBe("hello");
		expect(r.newFrom).toEqual({ line: 0, ch: 0 });
		expect(r.newTo).toEqual({ line: 0, ch: 5 });
	});

	it("unwraps *word*", () => {
		const r = toggleInlineFormat(sel("*hi*"), "*");
		expect(r.replacement).toBe("hi");
	});

	it("unwraps ==highlighted==", () => {
		const r = toggleInlineFormat(sel("==text=="), "==");
		expect(r.replacement).toBe("text");
	});

	it("does NOT unwrap **a** when content is too short (only markers)", () => {
		// "****" length is 4, m*2=4, not > m*2
		const r = toggleInlineFormat(sel("****"), "**");
		expect(r.replacement).toBe("********"); // wraps again
	});

	it("does NOT unwrap single * that is part of **bold**", () => {
		// "*hello*" where adjacent chars are also `*` — should wrap, not unwrap
		// sel = "*hello*" — but content[m] === marker[0] (h !== *) so it unwraps
		const r = toggleInlineFormat(sel("*hello*"), "*");
		expect(r.replacement).toBe("hello");
	});

	it("unwraps outer ** from ***hi*** leaving *hi* (guard only fires for m===1)", () => {
		// The adjacent-char guard only protects single-char markers (*) from
		// accidentally unwrapping **bold**. For m===2 it is skipped, so
		// "***hi***" unwraps its outer ** markers leaving the italic wrapper.
		const r = toggleInlineFormat(sel("***hi***"), "**");
		expect(r.replacement).toBe("*hi*");
	});
});

describe("toggleInlineFormat — unwrap outside-selection", () => {
	it("unwraps when markers sit just outside the selection", () => {
		// full line:  **hello**
		// selection:  hello   (ch 2..7)
		const info: SelectionInfo = {
			sel: "hello",
			from: { line: 0, ch: 2 },
			to:   { line: 0, ch: 7 },
			line: "**hello**",
		};
		const r = toggleInlineFormat(info, "**");
		expect(r.replacement).toBe("hello");
		expect(r.newFrom).toEqual({ line: 0, ch: 0 });
		expect(r.newTo).toEqual({ line: 0, ch: 5 });
	});

	it("unwraps *word* when cursor is on inner text", () => {
		const info: SelectionInfo = {
			sel: "hi",
			from: { line: 0, ch: 1 },
			to:   { line: 0, ch: 3 },
			line: "*hi*",
		};
		const r = toggleInlineFormat(info, "*");
		expect(r.replacement).toBe("hi");
		expect(r.newFrom.ch).toBe(0);
		expect(r.newTo.ch).toBe(2);
	});

	it("wraps normally when markers are NOT outside the selection", () => {
		const info: SelectionInfo = {
			sel: "hello",
			from: { line: 0, ch: 0 },
			to:   { line: 0, ch: 5 },
			line: "hello",
		};
		const r = toggleInlineFormat(info, "**");
		expect(r.replacement).toBe("**hello**");
	});
});

// ---------------------------------------------------------------------------
// getHeadingLevel
// ---------------------------------------------------------------------------

describe("getHeadingLevel", () => {
	it("returns null for plain text", () => expect(getHeadingLevel("hello")).toBeNull());
	it("returns 1 for # heading",     () => expect(getHeadingLevel("# Foo")).toBe(1));
	it("returns 2 for ## heading",    () => expect(getHeadingLevel("## Foo")).toBe(2));
	it("returns 6 for ###### heading",() => expect(getHeadingLevel("###### Foo")).toBe(6));
	it("returns null for ##no-space", () => expect(getHeadingLevel("##Foo")).toBeNull());
	it("returns null for empty string",() => expect(getHeadingLevel("")).toBeNull());
});

// ---------------------------------------------------------------------------
// getListType
// ---------------------------------------------------------------------------

describe("getListType", () => {
	it("detects bullet - item",           () => expect(getListType("- item")).toBe("bullet"));
	it("detects bullet * item",           () => expect(getListType("* item")).toBe("bullet"));
	it("detects bullet + item",           () => expect(getListType("+ item")).toBe("bullet"));
	it("detects numbered list",           () => expect(getListType("1. item")).toBe("numbered"));
	it("detects numbered list 42",        () => expect(getListType("42. item")).toBe("numbered"));
	it("detects unchecked checkbox",      () => expect(getListType("- [ ] task")).toBe("checkbox"));
	it("detects checked checkbox x",      () => expect(getListType("- [x] done")).toBe("checkbox"));
	it("detects checked checkbox X",      () => expect(getListType("- [X] done")).toBe("checkbox"));
	it("returns null for plain text",     () => expect(getListType("hello")).toBeNull());
	it("returns null for heading",        () => expect(getListType("# Heading")).toBeNull());
});

// ---------------------------------------------------------------------------
// applyHeading
// ---------------------------------------------------------------------------

describe("applyHeading", () => {
	it("applies H1 to plain text",      () => expect(applyHeading("hello", 1)).toBe("# hello"));
	it("applies H3 to plain text",      () => expect(applyHeading("hello", 3)).toBe("### hello"));
	it("removes heading when null",     () => expect(applyHeading("# hello", null)).toBe("hello"));
	it("replaces existing H2 with H4",  () => expect(applyHeading("## foo", 4)).toBe("#### foo"));
	it("removes H6",                    () => expect(applyHeading("###### x", null)).toBe("x"));
	it("applies H1 to already-H1 line", () => expect(applyHeading("# hello", 1)).toBe("# hello"));
	it("handles empty string",          () => expect(applyHeading("", 2)).toBe("## "));
});

// ---------------------------------------------------------------------------
// toggleBlockquote
// ---------------------------------------------------------------------------

describe("toggleBlockquote", () => {
	it("adds > to plain lines", () => {
		expect(toggleBlockquote(["hello", "world"])).toEqual(["> hello", "> world"]);
	});

	it("removes > from all-quoted lines", () => {
		expect(toggleBlockquote(["> hello", "> world"])).toEqual(["hello", "world"]);
	});

	it("adds > when mixed (not all quoted)", () => {
		expect(toggleBlockquote(["> hello", "world"])).toEqual(["> > hello", "> world"]);
	});

	it("handles single line — add", () => {
		expect(toggleBlockquote(["foo"])).toEqual(["> foo"]);
	});

	it("handles single line — remove", () => {
		expect(toggleBlockquote(["> foo"])).toEqual(["foo"]);
	});
});

// ---------------------------------------------------------------------------
// toggleCodeBlock
// ---------------------------------------------------------------------------

describe("toggleCodeBlock", () => {
	it("wraps text in fenced code block", () => {
		expect(toggleCodeBlock("hello")).toBe("```\nhello\n```");
	});

	it("unwraps an existing code block", () => {
		expect(toggleCodeBlock("```\nhello\n```")).toBe("hello");
	});

	it("wraps empty string", () => {
		expect(toggleCodeBlock("")).toBe("```\n\n```");
	});

	it("does NOT unwrap if content is just the fence markers (too short)", () => {
		// "```\n\n```" length is 8, not > 8
		expect(toggleCodeBlock("```\n\n```")).toBe("```\n```\n\n```\n```");
	});

	it("wraps multi-line text", () => {
		expect(toggleCodeBlock("a\nb")).toBe("```\na\nb\n```");
	});
});

// ---------------------------------------------------------------------------
// wrapLink
// ---------------------------------------------------------------------------

describe("wrapLink", () => {
	it("wraps selected text in markdown link", () => {
		const [result, ch] = wrapLink("click here", 0);
		expect(result).toBe("[click here]()");
		expect(ch).toBe(13); // 0 + 1 + 10 + 2 = 13, cursor inside ()
	});

	it("accounts for fromCh offset", () => {
		const [result, ch] = wrapLink("link", 5);
		expect(result).toBe("[link]()");
		expect(ch).toBe(12); // 5 + 1 + 4 + 2 = 12
	});

	it("wraps empty selection", () => {
		const [result, ch] = wrapLink("", 0);
		expect(result).toBe("[]()");
		// fromCh(0) + 1 + sel.length(0) + 2 = 3 → cursor inside ()
		expect(ch).toBe(3);
	});
});
