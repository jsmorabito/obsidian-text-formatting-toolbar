/**
 * Pure string-transformation helpers extracted from TextToolbarManager so
 * they can be unit-tested without the Obsidian runtime.
 */

export interface EditorPos { line: number; ch: number; }
export interface SelectionInfo {
	sel: string;
	from: EditorPos;
	to: EditorPos;
	line: string;
}

export interface ToggleResult {
	replacement: string;
	newFrom: EditorPos;
	newTo: EditorPos;
}

/**
 * Core toggle logic for inline markers (**, *, ~~, ==, `, %%).
 * Returns the replacement string and the new selection range.
 */
export function toggleInlineFormat(info: SelectionInfo, marker: string): ToggleResult {
	const { sel, from, to, line } = info;
	const m = marker.length;

	const prefixMatch = sel.match(/^(#{1,6} |> |- \[[ xX]\] |[-*+] |\d+\. )/);
	const prefix = prefixMatch ? prefixMatch[0] : "";
	const content = sel.slice(prefix.length);
	const contentCh = from.ch + prefix.length;

	// Case 1: selection itself is wrapped — unwrap
	if (
		from.line === to.line &&
		content.length > m * 2 &&
		content.substring(0, m) === marker &&
		content.substring(content.length - m) === marker &&
		(m > 1 || (content[m] !== marker[0] && content[content.length - m - 1] !== marker[0]))
	) {
		const inner = content.substring(m, content.length - m);
		return {
			replacement: prefix + inner,
			newFrom: { line: from.line, ch: contentCh },
			newTo:   { line: from.line, ch: contentCh + inner.length },
		};
	}

	// Case 2: markers are just outside the selection — expand-select then unwrap
	if (from.line === to.line && contentCh >= m && to.ch + m <= line.length) {
		const before = line.substring(contentCh - m, contentCh);
		const after  = line.substring(to.ch, to.ch + m);
		if (before === marker && after === marker) {
			return {
				replacement: content,           // caller must replace expanded selection
				newFrom: { line: from.line, ch: contentCh - m },
				newTo:   { line: from.line, ch: contentCh - m + content.length },
			};
		}
	}

	// Case 3: wrap
	return {
		replacement: `${prefix}${marker}${content}${marker}`,
		newFrom: { line: from.line, ch: contentCh + m },
		newTo: from.line === to.line
			? { line: from.line, ch: contentCh + m + content.length }
			: to,
	};
}

/** Returns the heading level (1-6) of a line, or null. */
export function getHeadingLevel(lineText: string): number | null {
	const m = lineText.match(/^(#{1,6}) /);
	return m ? m[1].length : null;
}

/** Returns the list type of a line, or null. */
export function getListType(lineText: string): "bullet" | "numbered" | "checkbox" | null {
	if (/^- \[[ xX]\] /.test(lineText)) return "checkbox";
	if (/^[-*+] /.test(lineText))        return "bullet";
	if (/^\d+\. /.test(lineText))         return "numbered";
	return null;
}

/** Applies or removes a heading prefix on a single line. */
export function applyHeading(lineText: string, level: number | null): string {
	const prefix = level !== null ? "#".repeat(level) + " " : "";
	return prefix + lineText.replace(/^#{1,6} /, "");
}

/** Toggles the `> ` blockquote prefix for a set of lines. */
export function toggleBlockquote(lines: string[]): string[] {
	const allQuoted = lines.every(l => l.startsWith("> "));
	return lines.map(l => allQuoted ? l.slice(2) : `> ${l}`);
}

/** Wraps or unwraps a selection in a fenced code block. */
export function toggleCodeBlock(sel: string): string {
	if (sel.startsWith("```\n") && sel.endsWith("\n```") && sel.length > 8) {
		return sel.slice(4, -4);
	}
	return `\`\`\`\n${sel}\n\`\`\``;
}

/** Wraps selected text in a markdown link and returns [result, cursorCh]. */
export function wrapLink(sel: string, fromCh: number): [string, number] {
	return [`[${sel}]()`, fromCh + 1 + sel.length + 2];
}
