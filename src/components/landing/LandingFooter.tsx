/**
 * LandingFooter.tsx — Premium cinematic footer
 */

import React from 'react';

export const LandingFooter: React.FC = () => {
    return (
        <footer className="cin-footer" role="contentinfo">
            <span>InfinityCN · Cinematifier</span>
            <span aria-hidden="true">·</span>
            <span>Stories deserve a stage</span>
        </footer>
    );
};

export default LandingFooter;
