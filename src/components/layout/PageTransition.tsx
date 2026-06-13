/**
 * PageTransition.tsx — Route transition animations powered by Framer Motion
 */

import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';

interface PageTransitionProps {
    children: React.ReactNode;
    routeKey: string;
}

export const PageTransition: React.FC<PageTransitionProps> = ({ children, routeKey }) => {
    const shouldReduceMotion = useReducedMotion();

    const variants = {
        initial: {
            opacity: shouldReduceMotion ? 1 : 0,
            x: shouldReduceMotion ? 0 : 16,
        },
        animate: {
            opacity: 1,
            x: 0,
            transition: {
                duration: shouldReduceMotion ? 0 : 0.3,
                ease: [0.4, 0, 0.2, 1] as const, // Standard Ease-in-out
            },
        },
        exit: {
            opacity: shouldReduceMotion ? 1 : 0,
            x: shouldReduceMotion ? 0 : -16,
            transition: {
                duration: shouldReduceMotion ? 0 : 0.3,
                ease: [0.4, 0, 0.2, 1] as const, // Standard Ease-in-out
            },
        },
    };

    return (
        <motion.div
            key={routeKey}
            initial="initial"
            animate="animate"
            exit="exit"
            variants={variants}
            style={{
                display: 'flex',
                flexDirection: 'column',
                flex: 1,
                width: '100%',
                minHeight: '100vh',
            }}
        >
            {children}
        </motion.div>
    );
};
