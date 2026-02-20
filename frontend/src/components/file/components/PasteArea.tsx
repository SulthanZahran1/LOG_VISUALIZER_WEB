/* global HTMLTextAreaElement */
interface PasteAreaProps {
    content: string;
    onChange: (content: string) => void;
    onCancel: () => void;
    onUpload: () => void;
}

export function PasteArea({ content, onChange, onCancel, onUpload }: PasteAreaProps) {
    return (
        <div class="paste-area" onClick={(e) => e.stopPropagation()}>
            <textarea
                value={content}
                onInput={(e) => onChange((e.target as HTMLTextAreaElement).value)}
                placeholder="Paste log content here..."
                rows={10}
            />
            <div class="paste-actions">
                <button class="btn-cancel" onClick={onCancel}>Cancel</button>
                <button class="btn-upload" onClick={onUpload}>Upload Text</button>
            </div>
        </div>
    );
}

export default PasteArea;
