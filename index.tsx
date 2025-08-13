import { GoogleGenAI, Type } from "@google/genai";
import React, { useState, useCallback, useMemo } from 'react';
import { createRoot } from 'react-dom/client';

const promptEnhancementOptions: Record<string, string> = {
    specialist: "Zachowaj się jak specjalista z 20-letnim doświadczeniem.",
    detailed: "Udziel bardzo szczegółowej i wyczerpującej odpowiedzi.",
    concise: "Udziel treściwej i konkretnej odpowiedzi.",
    instructions: "Udziel szczegółowych instrukcji krok po kroku.",
    code: "Skup się na generowaniu kodu programistycznego.",
    internet: "Korzystaj z aktualnych zasobów sieci Internet w celu udzielenia odpowiedzi.",
    verify: "Przed udzieleniem odpowiedzi, zweryfikuj poprawność danych.",
    askMore: "Dopytuj o szczegóły, aż problem zostanie rozwiązany."
};


const App = () => {
    // State management
    const [step, setStep] = useState('initial'); // 'initial', 'questions', 'result'
    const [initialPrompt, setInitialPrompt] = useState('');
    const [questions, setQuestions] = useState<string[]>([]);
    const [answers, setAnswers] = useState<string[]>([]);
    const [selectedOptions, setSelectedOptions] = useState<Record<string, boolean>>(
        Object.keys(promptEnhancementOptions).reduce((acc, key) => ({ ...acc, [key]: false }), {})
    );
    const [result, setResult] = useState<{ improvedPrompt: string; suggestions: string[] } | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [loadingAction, setLoadingAction] = useState<null | 'questions' | 'more' | 'refine'>(null);
    const [error, setError] = useState<string | null>(null);
    const [copyButtonText, setCopyButtonText] = useState('Kopiuj');

    // Memoize the AI client
    const ai = useMemo(() => new GoogleGenAI({ apiKey: process.env.API_KEY as string }), []);

    // Handlers
    const handleAnswerChange = (index: number, value: string) => {
        const newAnswers = [...answers];
        newAnswers[index] = value;
        setAnswers(newAnswers);
    };

    const handleOptionChange = (optionKey: string) => {
        setSelectedOptions(prev => ({ ...prev, [optionKey]: !prev[optionKey] }));
    };

    const handleGenerateQuestions = useCallback(async () => {
        if (!initialPrompt.trim()) return;
        setIsLoading(true);
        setLoadingAction('questions');
        setError(null);

        try {
            const systemInstruction = `Jesteś asystentem inżynierii promptów. Twoim zadaniem jest przeanalizowanie monitu użytkownika i wygenerowanie trzech pytań wyjaśniających, aby lepiej zrozumieć jego potrzeby i udoskonalić monit. Zwróć tylko tablicę JSON zawierającą trzy pytania w formie stringów.`;
            
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: `Oto monit użytkownika: "${initialPrompt}"`,
                config: {
                    systemInstruction: systemInstruction,
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING }
                    }
                }
            });

            const generatedQuestions = JSON.parse(response.text);
            if (Array.isArray(generatedQuestions) && generatedQuestions.length > 0) {
                const newQuestions = generatedQuestions.slice(0, 3);
                setQuestions(newQuestions);
                setAnswers(Array(newQuestions.length).fill(''));
                setStep('questions');
            } else {
                throw new Error("Otrzymano nieprawidłowy format pytań od AI.");
            }
        } catch (e) {
            console.error(e);
            setError("Nie udało się wygenerować pytań. Spróbuj ponownie z innym monitem.");
        } finally {
            setIsLoading(false);
            setLoadingAction(null);
        }
    }, [initialPrompt, ai]);

    const handleGenerateMoreQuestions = useCallback(async () => {
        if (answers.some(a => !a.trim())) return;
        setIsLoading(true);
        setLoadingAction('more');
        setError(null);

        try {
            const context = `
                Oryginalny monit: "${initialPrompt}"
                
                Dotychczasowe pytania i odpowiedzi:
                ${questions.map((q, i) => `P: ${q}\nO: ${answers[i] || 'Brak odpowiedzi'}`).join('\n\n')}
            `;

            const systemInstruction = `Jesteś asystentem inżynierii promptów. Twoim zadaniem jest przeanalizowanie monitu użytkownika i dotychczasowej konwersacji, a następnie wygenerowanie trzech DODATKOWYCH pytań wyjaśniających. Pytania nie mogą się powtarzać i muszą być inne niż poprzednie. Zwróć tylko tablicę JSON zawierającą trzy nowe pytania w formie stringów.`;
        
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: context,
                config: {
                    systemInstruction: systemInstruction,
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING }
                    }
                }
            });

            const newQuestions = JSON.parse(response.text);
             if (Array.isArray(newQuestions) && newQuestions.length > 0) {
                setQuestions(prev => [...prev, ...newQuestions]);
                setAnswers(prev => [...prev, ...Array(newQuestions.length).fill('')]);
            } else {
                throw new Error("Otrzymano nieprawidłowy format dodatkowych pytań od AI.");
            }

        } catch(e) {
            console.error(e);
            setError("Nie udało się wygenerować dodatkowych pytań. Spróbuj ponownie lub zakończ generowanie.");
        } finally {
            setIsLoading(false);
            setLoadingAction(null);
        }
    }, [initialPrompt, questions, answers, ai]);
    
    const handleRefinePrompt = useCallback(async () => {
        if (answers.some(a => !a.trim())) return;
        setIsLoading(true);
        setLoadingAction('refine');
        setError(null);

        try {
            const selectedInstructions = Object.entries(selectedOptions)
                .filter(([, isSelected]) => isSelected)
                .map(([key]) => promptEnhancementOptions[key as keyof typeof promptEnhancementOptions])
                .join('\n');

            const context = `
                Oryginalny monit: "${initialPrompt}"
                
                Pytania wyjaśniające i odpowiedzi użytkownika:
                ${questions.map((q, i) => `${i + 1}. P: ${q}\n   O: ${answers[i]}`).join('\n')}

                ${selectedInstructions ? `Dodatkowe instrukcje dotyczące stylu i zachowania AI, które muszą być zawarte w monicie:\n${selectedInstructions}` : ''}
            `;
            
            const systemInstruction = `Jesteś ekspertem w dziedzinie inżynierii promptów. Otrzymasz oryginalny monit, odpowiedzi na pytania oraz opcjonalne instrukcje dotyczące stylu. Twoim zadaniem jest zsyntetyzowanie WSZYSTKICH tych informacji w jeden, znacznie ulepszony i szczegółowy monit. Monit musi zawierać wszystkie przekazane instrukcje. Dodatkowo, przedstaw trzy sugestie dotyczące dalszych ulepszeń. Zwróć wynik w postaci obiektu JSON z dwoma kluczami: 'improvedPrompt' (string) i 'suggestions' (tablica stringów).`;

            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: context,
                config: {
                    systemInstruction: systemInstruction,
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: {
                            improvedPrompt: { type: Type.STRING },
                            suggestions: { 
                                type: Type.ARRAY,
                                items: { type: Type.STRING }
                            }
                        }
                    }
                }
            });

            const refinedResult = JSON.parse(response.text);
            setResult(refinedResult);
            setStep('result');

        } catch (e) {
            console.error(e);
            setError("Nie udało się udoskonalić monitu. Spróbuj ponownie.");
        } finally {
            setIsLoading(false);
            setLoadingAction(null);
        }
    }, [initialPrompt, questions, answers, ai, selectedOptions]);

    const handleReset = () => {
        setStep('initial');
        setInitialPrompt('');
        setQuestions([]);
        setAnswers([]);
        setResult(null);
        setError(null);
        setIsLoading(false);
        setLoadingAction(null);
        setCopyButtonText('Kopiuj');
        setSelectedOptions(
            Object.keys(promptEnhancementOptions).reduce((acc, key) => ({ ...acc, [key]: false }), {})
        );
    };
    
    const handleCopy = () => {
        if(result?.improvedPrompt) {
            navigator.clipboard.writeText(result.improvedPrompt);
            setCopyButtonText('Skopiowano!');
            setTimeout(() => setCopyButtonText('Kopiuj'), 2000);
        }
    };
    
    // UI Components
    const Loader = () => <div className="loader"></div>;

    return (
        <>
            <h1>Generator Pormp</h1>
            
            {error && <div className="card error-message"><p>{error}</p></div>}

            {step === 'initial' && (
                <div className="card">
                    <h2>Krok 1: Wprowadź swój pomysł</h2>
                    <p>Zacznij od wpisania prostego monitu, zapytania składającego się z kilku słów, na temat, na który chcesz uzyskać odpowiedz:</p>
                    <textarea
                        value={initialPrompt}
                        onChange={(e) => setInitialPrompt(e.target.value)}
                        placeholder="np. stwórz opowiadanie o smoku..."
                        rows={5}
                        aria-label="Początkowy monit"
                        disabled={isLoading}
                    />
                    <button onClick={handleGenerateQuestions} disabled={!initialPrompt.trim() || isLoading}>
                        {isLoading && loadingAction === 'questions' ? <Loader /> : 'Generuj pytania'}
                    </button>
                </div>
            )}

            {step === 'questions' && (
                <div className="card">
                    <h2>Krok 2: Odpowiedz na pytania</h2>
                    <p>Aby lepiej zrozumieć Twoje potrzeby, AI przygotowało kilka pytań. Odpowiedz na wszystkie, aby kontynuować.</p>
                    {questions.map((q, index) => (
                        <div key={index} className="question-group">
                            <label htmlFor={`answer-${index}`}>{index + 1}. {q}</label>
                            <textarea
                                id={`answer-${index}`}
                                value={answers[index]}
                                onChange={(e) => handleAnswerChange(index, e.target.value)}
                                placeholder="Twoja odpowiedź..."
                                rows={3}
                                aria-label={`Odpowiedź na pytanie ${index + 1}`}
                                disabled={isLoading}
                            />
                        </div>
                    ))}
                    
                    <div className="options-container">
                        <h3>Krok 3: Dostosuj styl odpowiedzi (opcjonalnie)</h3>
                        <p>Wybierz dodatkowe instrukcje, które zostaną zawarte w finalnym monicie.</p>
                        <div className="options-grid">
                            {Object.entries(promptEnhancementOptions).map(([key, label]) => (
                                <div key={key} className="option-item" onClick={() => !isLoading && handleOptionChange(key)}>
                                    <input
                                        type="checkbox"
                                        id={`option-${key}`}
                                        checked={selectedOptions[key]}
                                        onChange={() => handleOptionChange(key)}
                                        disabled={isLoading}
                                        aria-labelledby={`label-option-${key}`}
                                    />
                                    <label id={`label-option-${key}`} htmlFor={`option-${key}`}>{label}</label>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="more-questions-container">
                        <h3>Chcesz kontynuować?</h3>
                        <div className="button-group">
                            <button onClick={handleGenerateMoreQuestions} disabled={answers.some(a => !a.trim()) || isLoading}>
                                {isLoading && loadingAction === 'more' ? <Loader /> : 'Tak, poproszę więcej pytań'}
                            </button>
                            <button onClick={handleRefinePrompt} disabled={answers.some(a => !a.trim()) || isLoading}>
                                {isLoading && loadingAction === 'refine' ? <Loader /> : 'Nie, generuj prompt'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {step === 'result' && result && (
                 <div className="card">
                    <h2>Wynik: Twój ulepszony monit</h2>
                    <div className="prompt-output">
                         <button className="copy-button" onClick={handleCopy}>{copyButtonText}</button>
                        {result.improvedPrompt}
                    </div>

                    <div className="results-section">
                        <h2>Dalsze sugestie</h2>
                        <ul className="suggestions-list">
                            {result.suggestions.map((s, index) => (
                                <li key={index}>{s}</li>
                            ))}
                        </ul>
                    </div>
                     <button onClick={handleReset}>Zacznij od nowa</button>
                </div>
            )}
        </>
    );
};

const container = document.getElementById('root');
if(container) {
    const root = createRoot(container);
    root.render(<React.StrictMode><App /></React.StrictMode>);
}