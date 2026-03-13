import React, { useState, useRef, useEffect } from 'react';

const OTP_LENGTH = 4;
const OTP_TIMEOUT_SECONDS = 180; // 3 minutes

const OtpModal = ({ isOpen, onSubmit, onCancel, digits = OTP_LENGTH, title = "Enter Delivery OTP" }) => {
    const [values, setValues] = useState(Array(digits).fill(''));
    const [error, setError] = useState('');
    const [shake, setShake] = useState(false);
    const [secondsLeft, setSecondsLeft] = useState(OTP_TIMEOUT_SECONDS);
    const [submitting, setSubmitting] = useState(false);
    const inputRefs = useRef([]);

    // Focus first input on open
    useEffect(() => {
        if (isOpen) {
            setValues(Array(digits).fill(''));
            setError('');
            setShake(false);
            setSecondsLeft(OTP_TIMEOUT_SECONDS);
            setSubmitting(false);
            setTimeout(() => inputRefs.current[0]?.focus(), 100);
        }
    }, [isOpen, digits]);

    // Countdown timer
    useEffect(() => {
        if (!isOpen) return;
        if (secondsLeft <= 0) {
            onCancel?.();
            return;
        }
        const timer = setInterval(() => setSecondsLeft(s => s - 1), 1000);
        return () => clearInterval(timer);
    }, [isOpen, secondsLeft, onCancel]);

    const handleChange = (index, value) => {
        if (!/^\d*$/.test(value)) return; // Only allow digits
        const newValues = [...values];
        newValues[index] = value.slice(-1); // Take last character only
        setValues(newValues);
        setError('');

        // Auto-advance
        if (value && index < digits - 1) {
            inputRefs.current[index + 1]?.focus();
        }

        // Auto-submit when all digits entered
        if (value && index === digits - 1 && newValues.every(v => v !== '')) {
            handleSubmit(newValues);
        }
    };

    const handleKeyDown = (index, e) => {
        if (e.key === 'Backspace' && !values[index] && index > 0) {
            inputRefs.current[index - 1]?.focus();
        }
    };

    const handleSubmit = async (submitValues) => {
        const otp = (submitValues || values).join('');
        if (otp.length < digits) {
            setError(`Enter all ${digits} digits`);
            setShake(true);
            setTimeout(() => setShake(false), 400);
            return;
        }
        setSubmitting(true);
        try {
            const result = await onSubmit?.(otp);
            if (result === false) {
                // Submission failed — show error, allow retry
                setError('Invalid OTP — please try again');
                setShake(true);
                setTimeout(() => setShake(false), 400);
                setValues(Array(digits).fill(''));
                setTimeout(() => inputRefs.current[0]?.focus(), 100);
            }
        } catch (err) {
            setError(err.message || 'Verification failed');
            setShake(true);
            setTimeout(() => setShake(false), 400);
            setValues(Array(digits).fill(''));
            setTimeout(() => inputRefs.current[0]?.focus(), 100);
        } finally {
            setSubmitting(false);
        }
    };

    const handleRetry = () => {
        setValues(Array(digits).fill(''));
        setError('');
        inputRefs.current[0]?.focus();
    };

    const formatTime = (s) => {
        const m = Math.floor(s / 60);
        const sec = s % 60;
        return `${m}:${sec.toString().padStart(2, '0')}`;
    };

    if (!isOpen) return null;

    return (
        <div style={styles.overlay} onClick={(e) => e.target === e.currentTarget && onCancel?.()}>
            <div style={{ ...styles.modal, ...(shake ? styles.shake : {}) }}>
                <h3 style={styles.title}>{title}</h3>
                <p style={styles.subtitle}>Ask the customer for the {digits}-digit code</p>

                <div style={styles.inputRow}>
                    {values.map((val, i) => (
                        <input
                            key={i}
                            ref={el => inputRefs.current[i] = el}
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            maxLength={1}
                            value={val}
                            onChange={e => handleChange(i, e.target.value)}
                            onKeyDown={e => handleKeyDown(i, e)}
                            style={{
                                ...styles.digit,
                                borderColor: error ? '#ef4444' : val ? '#22c55e' : '#374151',
                            }}
                            disabled={submitting}
                            autoComplete="off"
                        />
                    ))}
                </div>

                {error && <p style={styles.error}>{error}</p>}

                <div style={styles.timer}>
                    <span style={{ color: secondsLeft < 30 ? '#ef4444' : '#9ca3af' }}>
                        ⏱ {formatTime(secondsLeft)} remaining
                    </span>
                </div>

                <div style={styles.actions}>
                    <button onClick={onCancel} style={styles.cancelBtn} disabled={submitting}>
                        Cancel
                    </button>
                    <button onClick={handleRetry} style={styles.retryBtn} disabled={submitting}>
                        Clear
                    </button>
                    <button
                        onClick={() => handleSubmit()}
                        style={{
                            ...styles.confirmBtn,
                            opacity: values.every(v => v !== '') && !submitting ? 1 : 0.5,
                        }}
                        disabled={!values.every(v => v !== '') || submitting}
                    >
                        {submitting ? '...' : '✅ Confirm'}
                    </button>
                </div>
            </div>
        </div>
    );
};

const styles = {
    overlay: {
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex',
        alignItems: 'center', justifyContent: 'center', zIndex: 10000,
        backdropFilter: 'blur(4px)',
    },
    modal: {
        backgroundColor: '#1f2937', borderRadius: 16, padding: '28px 24px',
        width: '90%', maxWidth: 360, textAlign: 'center',
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        transition: 'transform 0.2s',
    },
    shake: {
        animation: 'otpShake 0.4s ease-in-out',
    },
    title: {
        color: '#fff', fontSize: 20, fontWeight: 700, margin: '0 0 4px',
    },
    subtitle: {
        color: '#9ca3af', fontSize: 14, margin: '0 0 20px',
    },
    inputRow: {
        display: 'flex', gap: 12, justifyContent: 'center', marginBottom: 16,
    },
    digit: {
        width: 52, height: 60, fontSize: 28, fontWeight: 700,
        textAlign: 'center', borderRadius: 12,
        border: '2px solid #374151', backgroundColor: '#111827',
        color: '#fff', outline: 'none', caretColor: '#22c55e',
        transition: 'border-color 0.2s',
    },
    error: {
        color: '#ef4444', fontSize: 13, margin: '0 0 12px',
    },
    timer: {
        marginBottom: 20, fontSize: 14,
    },
    actions: {
        display: 'flex', gap: 10, justifyContent: 'center',
    },
    cancelBtn: {
        padding: '10px 16px', borderRadius: 10, border: '1px solid #374151',
        backgroundColor: 'transparent', color: '#9ca3af', fontSize: 14,
        cursor: 'pointer', fontWeight: 600,
    },
    retryBtn: {
        padding: '10px 16px', borderRadius: 10, border: '1px solid #374151',
        backgroundColor: 'transparent', color: '#fbbf24', fontSize: 14,
        cursor: 'pointer', fontWeight: 600,
    },
    confirmBtn: {
        padding: '10px 20px', borderRadius: 10, border: 'none',
        backgroundColor: '#22c55e', color: '#fff', fontSize: 14,
        cursor: 'pointer', fontWeight: 700, transition: 'opacity 0.2s',
    },
};

// Inject shake keyframes
if (typeof document !== 'undefined' && !document.getElementById('otp-shake-style')) {
    const style = document.createElement('style');
    style.id = 'otp-shake-style';
    style.textContent = `@keyframes otpShake { 0%,100%{transform:translateX(0)} 20%,60%{transform:translateX(-8px)} 40%,80%{transform:translateX(8px)} }`;
    document.head.appendChild(style);
}

export default OtpModal;
