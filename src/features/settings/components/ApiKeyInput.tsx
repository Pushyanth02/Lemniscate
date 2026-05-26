import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

interface APIKeyInputProps {
    id: string;
    label: string;
    value: string;
    placeholder?: string;
    onChange: (value: string) => void;
    helpText?: string;
}

export const APIKeyInput: React.FC<APIKeyInputProps> = ({
    id,
    label,
    value,
    placeholder = '',
    onChange,
    helpText,
}) => {
    const [show, setShow] = useState(false);

    return (
        <div className="cine-input-group">
            <label htmlFor={id}>{label}</label>
            <div className="cine-key-input-row">
                <input
                    id={id}
                    type={show ? 'text' : 'password'}
                    value={value}
                    onChange={e => onChange(e.target.value)}
                    placeholder={placeholder}
                    autoComplete="new-password"
                />
                <button
                    type="button"
                    className="cine-btn cine-btn--ghost"
                    style={{ padding: '8px', minWidth: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    aria-label={show ? 'Hide API key' : 'Show API key'}
                    onClick={() => setShow(s => !s)}
                >
                    {show ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
            </div>
            {helpText && <p className="cine-field-help">{helpText}</p>}
        </div>
    );
};

export default APIKeyInput;
