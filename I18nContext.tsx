
import React, { createContext, useState, useContext, useCallback, ReactNode } from 'react';
import { translations } from './translations';

export type Language = 'en' | 'ru';

interface I18nContextType {
    language: Language;
    setLanguage: (lang: Language) => void;
    t: (key: string, params?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

export const I18nProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [language, setLanguage] = useState<Language>('en');

    const t = useCallback((key: string, params: Record<string, string | number> = {}) => {
        const langDict = translations[language] || translations['en'];
        let translation = langDict[key] || key;
        
        Object.keys(params).forEach(paramKey => {
            const regex = new RegExp(`\\{\\{${paramKey}\\}\\}`, 'g');
            translation = translation.replace(regex, String(params[paramKey]));
        });
        return translation;
    }, [language]);

    return (
        <I18nContext.Provider value={{ language, setLanguage, t }}>
            {children}
        </I18nContext.Provider>
    );
};

export const useTranslation = (): I18nContextType => {
    const context = useContext(I18nContext);
    if (!context) {
        throw new Error('useTranslation must be used within an I18nProvider');
    }
    return context;
};
