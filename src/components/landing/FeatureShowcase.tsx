/**
 * FeatureShowcase.tsx — Features strip highlighting cinematic options
 */

import React from 'react';
import { motion } from 'framer-motion';

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

const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: {
            staggerChildren: 0.08,
        },
    },
};

const itemVariants = {
    hidden: { opacity: 0, y: 16 },
    visible: {
        opacity: 1,
        y: 0,
        transition: {
            duration: 0.4,
            ease: [0.4, 0, 0.2, 1] as [number, number, number, number],
        },
    },
};

export const FeatureShowcase: React.FC = () => {
    return (
        <motion.section 
            className="cin-features" 
            aria-label="Key features"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
        >
            {FEATURES.map(f => (
                <motion.div 
                    key={f.label} 
                    className="cin-feature-tile"
                    variants={itemVariants}
                    whileHover={{ scale: 1.02 }}
                    transition={{ duration: 0.15, ease: "linear" }}
                >
                    <span className="cin-feature-icon" aria-hidden="true">
                        {f.icon}
                    </span>
                    <span className="cin-feature-label">{f.label}</span>
                    <span className="cin-feature-desc">{f.desc}</span>
                </motion.div>
            ))}
        </motion.section>
    );
};

export default FeatureShowcase;
