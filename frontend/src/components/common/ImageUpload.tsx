import { useState, type ChangeEvent } from 'react';
import { absoluteUrl } from '../../api/client';
import { ErrorAlert } from './ErrorAlert';

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 2 * 1024 * 1024;

interface Props {
  currentUrl: string | null;
  onUpload: (file: File) => Promise<void>;
  onRemove: () => Promise<void>;
  disabled?: boolean;
}

/** Image picker with preview and client-side type/size checks mirroring the API (jpeg/png/webp ≤ 2 MB). */
export function ImageUpload({ currentUrl, onUpload, onRemove, disabled = false }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);

  const choose = (e: ChangeEvent<HTMLInputElement>) => {
    const next = e.target.files?.[0] ?? null;
    setError(null);
    if (preview) URL.revokeObjectURL(preview);
    if (!next) {
      setFile(null);
      setPreview(null);
      return;
    }
    if (!ALLOWED.includes(next.type)) {
      setError('Only JPEG, PNG or WebP images are allowed');
      setFile(null);
      setPreview(null);
      return;
    }
    if (next.size > MAX_BYTES) {
      setError('Image must be 2 MB or smaller');
      setFile(null);
      setPreview(null);
      return;
    }
    setFile(next);
    setPreview(URL.createObjectURL(next));
  };

  const run = async (action: () => Promise<void>) => {
    setPending(true);
    setError(null);
    try {
      await action();
      if (preview) URL.revokeObjectURL(preview);
      setFile(null);
      setPreview(null);
    } catch (err) {
      setError(err);
    } finally {
      setPending(false);
    }
  };

  const shown = preview ?? (currentUrl ? absoluteUrl(currentUrl) : null);

  return (
    <div className="card">
      <div className="card-body">
        <h2 className="h6">Image</h2>
        {shown ? (
          <img src={shown} alt="Asset" className="img-fluid rounded mb-2" style={{ maxHeight: 220, objectFit: 'contain' }} />
        ) : (
          <div className="text-secondary small mb-2">No image uploaded.</div>
        )}
        <ErrorAlert error={error} className="py-2" />
        <input type="file" className="form-control form-control-sm mb-2" accept={ALLOWED.join(',')} onChange={choose} disabled={disabled || pending} aria-label="Choose image" />
        <div className="d-flex gap-2">
          <button type="button" className="btn btn-sm btn-primary" disabled={!file || disabled || pending} onClick={() => file && run(() => onUpload(file))}>
            {pending ? 'Uploading…' : 'Upload'}
          </button>
          {currentUrl && (
            <button type="button" className="btn btn-sm btn-outline-danger" disabled={disabled || pending} onClick={() => run(onRemove)}>
              Remove image
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
