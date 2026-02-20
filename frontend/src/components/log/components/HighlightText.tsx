/**
 * HighlightText Component
 * 
 * Renders text with search query highlights.
 */
import type { ComponentChildren } from 'preact';

export interface HighlightTextProps {
    /** Text to render */
    text: string;
    /** Search query to highlight */
    query: string;
    /** Use regex for matching */
    useRegex?: boolean;
    /** Case sensitive matching */
    caseSensitive?: boolean;
    /** CSS class for highlight marks */
    highlightClass?: string;
}

/**
 * Split text by regex and return parts with match info
 */
function splitTextByRegex(
    text: string,
    query: string,
    useRegex: boolean,
    caseSensitive: boolean
): Array<{ text: string; isMatch: boolean }> {
    if (!query.trim()) {
        return [{ text, isMatch: false }];
    }

    try {
        let regex: RegExp;
        const flags = caseSensitive ? 'g' : 'gi';

        if (useRegex) {
            regex = new RegExp(`(${query})`, flags);
        } else {
            const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            regex = new RegExp(`(${escaped})`, flags);
        }

        const parts: Array<{ text: string; isMatch: boolean }> = [];
        let lastIndex = 0;
        let match: RegExpExecArray | null;

        // Reset regex lastIndex
        regex.lastIndex = 0;

        while ((match = regex.exec(text)) !== null) {
            // Add non-matching part before this match
            if (match.index > lastIndex) {
                parts.push({
                    text: text.slice(lastIndex, match.index),
                    isMatch: false
                });
            }

            // Add the matching part
            parts.push({
                text: match[0],
                isMatch: true
            });

            lastIndex = match.index + match[0].length;

            // Prevent infinite loop on zero-width matches
            if (match[0].length === 0) {
                regex.lastIndex++;
            }
        }

        // Add remaining non-matching part
        if (lastIndex < text.length) {
            parts.push({
                text: text.slice(lastIndex),
                isMatch: false
            });
        }

        return parts.length > 0 ? parts : [{ text, isMatch: false }];
    } catch {
        // Invalid regex - return as plain text
        return [{ text, isMatch: false }];
    }
}

/**
 * Component that highlights search matches in text
 */
export function HighlightText({
    text,
    query,
    useRegex = false,
    caseSensitive = false,
    highlightClass = 'highlight-match'
}: HighlightTextProps): ComponentChildren {
    if (!query.trim()) {
        return <span>{text}</span>;
    }

    const parts = splitTextByRegex(text, query, useRegex, caseSensitive);

    return (
        <span>
            {parts.map((part, index) =>
                part.isMatch ? (
                    <mark key={index} className={highlightClass}>
                        {part.text}
                    </mark>
                ) : (
                    <span key={index}>{part.text}</span>
                )
            )}
        </span>
    );
}

export default HighlightText;
