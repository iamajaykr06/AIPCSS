/**
 * Copyright 2026 Zaid Alam, Ajay Kumar, Aboni Mohan Sahu, Rohit Kumar Yadav
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import React, { useRef, useState } from 'react';
import { Upload, Info, FileText } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { useToast } from '@/context/useToast';
import { getErrorMessage } from '@/lib/utils';

interface BulkImportResult {
    message: string;
    errors?: string[];
}

interface BulkImportModalProps {
    isOpen: boolean;
    onClose: () => void;
    resourceName: string;
    headers: string[];
    onImport: (file: File) => Promise<BulkImportResult>;
    onSuccess?: () => void;
    formatExamples?: { [key: string]: string };
}

export function BulkImportModal({ isOpen, onClose, resourceName, headers, onImport, onSuccess, formatExamples }: BulkImportModalProps) {
    const [file, setFile] = useState<File | null>(null);
    const [importing, setImporting] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const { toast } = useToast();

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selected = e.target.files?.[0];
        if (selected) setFile(selected);
    };

    const resetSelection = () => {
        setFile(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const handleUpload = async () => {
        if (!file) {
            toast('error', 'Please select a file');
            return;
        }

        setImporting(true);
        try {
            const res = await onImport(file);
            toast('success', res.message);
            if (res.errors?.length) {
                toast('warning', 'Import completed with issues', `${res.errors.length} row(s) need attention.`);
            }
            onSuccess?.();
            onClose();
            resetSelection();
        } catch (err) {
            toast('error', 'Import failed', getErrorMessage(err));
        } finally {
            setImporting(false);
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={() => !importing && onClose()}
            title={`Bulk Import - ${resourceName}`}
            size="md"
            footer={
                <>
                    <button className="btn btn-secondary" onClick={() => !importing && onClose()} disabled={importing}>Cancel</button>
                    <button className="btn btn-primary" onClick={handleUpload} disabled={!file || importing}>
                        {importing ? <span className="spinner" style={{ width: '1rem', height: '1rem', marginRight: '0.5rem' }} /> : <Upload size={16} />}
                        {importing ? 'Importing...' : 'Upload & Process'}
                    </button>
                </>
            }
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <div style={{ padding: '1rem', background: 'var(--bg-main)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', color: 'var(--color-primary-600)', fontWeight: 600 }}>
                        <Info size={18} />
                        Excel File Format Requirements
                    </div>
                    <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginBottom: '0.75rem', lineHeight: '1.4' }}>
                        To ensure successful import, your Excel file must contain exactly these <strong>case-sensitive</strong> column headers in the first row:
                    </p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem', marginBottom: '1rem' }}>
                        {headers.map(h => (
                            <span key={h} className="badge badge-blue" style={{ fontSize: '0.75rem', padding: '0.25rem 0.625rem' }}>{h}</span>
                        ))}
                    </div>

                    {formatExamples && (
                        <div>
                            <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginBottom: '0.5rem', fontWeight: 600 }}>
                                Format Examples:
                            </p>
                            <div style={{ background: 'var(--bg)', padding: '0.75rem', borderRadius: '0.375rem', fontSize: '0.75rem', fontFamily: 'monospace' }}>
                                {Object.entries(formatExamples).map(([key, value]) => (
                                    <div key={key} style={{ marginBottom: '0.25rem' }}>
                                        <span style={{ color: 'var(--color-primary-600)' }}>{key}:</span> {value}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <div
                    style={{
                        border: '2px dashed var(--border)',
                        borderRadius: 'var(--radius-xl)',
                        padding: '2rem',
                        textAlign: 'center',
                        background: file ? 'rgba(59, 130, 246, 0.03)' : 'transparent',
                        transition: 'all 0.2s',
                        cursor: importing ? 'not-allowed' : 'pointer',
                        borderColor: file ? 'var(--color-primary-400)' : 'var(--border)',
                    }}
                    onClick={() => !importing && fileInputRef.current?.click()}
                >
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".xlsx, .xls"
                        onChange={handleFileChange}
                        style={{ display: 'none' }}
                        disabled={importing}
                    />
                    {file ? (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                            <FileText size={42} style={{ color: 'var(--color-primary-500)' }} />
                            <div style={{ fontWeight: 600, color: 'var(--text-primary)', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis' }}>{file.name}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{(file.size / 1024).toFixed(1)} KB</div>
                            {!importing && (
                                <button
                                    className="btn btn-ghost btn-sm"
                                    style={{ marginTop: '0.5rem', color: 'var(--color-primary-600)' }}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        resetSelection();
                                    }}
                                >
                                    Change File
                                </button>
                            )}
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.875rem' }}>
                            <div style={{ width: '3.5rem', height: '3.5rem', borderRadius: '50%', background: 'var(--bg-main)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                                <Upload size={24} />
                            </div>
                            <div>
                                <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>Click to choose Excel file</div>
                                <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>Supports .xlsx and .xls formats</div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </Modal>
    );
}
