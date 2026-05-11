import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';

const Splash = () => {
    const navigate = useNavigate();

    useEffect(() => {
        const timer = setTimeout(() => {
            navigate('/home');
        }, 2500);
        return () => clearTimeout(timer);
    }, [navigate]);

    return (
        <div className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none">
            <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className="flex flex-col items-center justify-center text-center pointer-events-auto"
            >
                <motion.img
                    src="/evara-logo.png"
                    alt="EvaraTech Logo"
                    className="w-32 h-32 mx-auto mb-6 object-contain"
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.1, duration: 0.7 }}
                />
                <motion.h1
                    className="text-6xl font-bold text-[var(--color-evara-blue)] mb-4"
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.3, duration: 0.6 }}
                >
                    EvaraTech
                </motion.h1>
                <motion.p
                    className="text-xl text-[var(--color-evara-green)]"
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.6, duration: 0.6 }}
                >
                    Smart Water Infrastructure
                </motion.p>
            </motion.div>
        </div>
    );
};

export default Splash;
