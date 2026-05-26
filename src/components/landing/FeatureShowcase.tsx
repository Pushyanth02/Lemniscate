/**
 * FeatureShowcase.tsx — Features strip highlighting cinematic options
 */

import React from 'react';

const FEATURES = [
    {
        icon: '🎬',
        label: 'Cinematic Blocks',
        desc: 'Dialogue, action, SFX, scene breaks',
    },
    {
        icon: '🎭',
        label: 'Emotion Engine',
        desc: 'Real-time tension & emotion tracking',
    },
    {
        icon: '📖',
        label: 'Dual Modes',
        desc: 'Original text or full cinematification',
    },
    {
        icon: '🌒',
        label: 'Offline-First',
        desc: 'No cloud required, runs locally',
    },
];

export const FeatureShowcase: React.FC = () => {
    return (
        <section className="cin-features" aria-label="Key features">
            {FEATURES.map(f => (
                <div key={f.label} className="cin-feature-tile">
                    <span className="cin-feature-icon" aria-hidden="true">
                        {f.icon}
                    </span>
                    <span className="cin-feature-label">{f.label}</span>
                    <span className="cin-feature-desc">{f.desc}</span>
                </div>
            ))}
        </section>
    );
};

export default FeatureShowcase;
