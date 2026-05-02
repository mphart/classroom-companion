import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import logo from '@/imports/classroomcompanion_logo_v4.svg';
import { ThemeToggle } from '@/app/components/ThemeToggle';

interface Document {
  id: string;
  title: string;
  type: 'ai_summary' | 'full_transcript' | 'key_terms' | 'study_questions' | 'generated_summary';
  content: string;
  generated?: boolean;
}

export function Viewer() {
  const navigate = useNavigate();
  const location = useLocation();
  const [selectedDocId, setSelectedDocId] = useState('1');
  const openedFile = location.state as { title?: string; content?: string } | null;

  const sessionName = 'Lecture-05-02';
  const sessionDate = 'May 2, 2026 • 2:15 PM';

  const defaultDocuments: Document[] = [
    {
      id: '1',
      title: 'AI Summary',
      type: 'ai_summary',
      content: `# Quantum Mechanics Lecture Summary

## Key Concepts

This lecture covered fundamental principles of quantum mechanics with a focus on wave-particle duality and the Schrödinger equation.

### Wave-Particle Duality

The concept that matter and energy exhibit properties of both waves and particles. This dual nature is central to understanding quantum behavior at the atomic and subatomic levels.

### The Schrödinger Equation

The fundamental equation of quantum mechanics that describes how the quantum state of a physical system changes over time. It is expressed as:

iℏ ∂ψ/∂t = Ĥψ

Where:
- ψ is the wave function
- ℏ is the reduced Planck constant
- Ĥ is the Hamiltonian operator

### Observer Effect

A critical principle in quantum mechanics: the act of observation affects the state of quantum particles. This challenges classical assumptions about measurement and reality.

## Important Notes

The professor emphasized that these concepts will appear on the midterm exam. Students should focus on understanding the practical applications of the Schrödinger equation and be prepared to explain the observer effect with examples.`,
    },
    {
      id: '2',
      title: 'Full Transcript',
      type: 'full_transcript',
      content: `Today we will be discussing quantum mechanics and wave-particle duality. The Schrödinger equation is fundamental to understanding quantum systems. Remember that observation affects the state of quantum particles. This concept will be on the midterm exam.

Let's start with the basics. Quantum mechanics emerged in the early 20th century when classical physics couldn't explain certain phenomena at the atomic scale. Max Planck's work on blackbody radiation and Einstein's photoelectric effect were crucial early developments.

The wave-particle duality is perhaps the most counterintuitive aspect of quantum mechanics. Light, which we typically think of as a wave, also behaves as discrete particles called photons. Similarly, electrons, which we think of as particles, can exhibit wave-like behavior.

The Schrödinger equation provides a mathematical framework for describing quantum systems. It tells us how the wave function evolves over time. The wave function contains all the information about a quantum system.

The observer effect is particularly fascinating. In the famous double-slit experiment, particles behave differently when observed versus when they're not. This isn't just a measurement limitation—it's a fundamental property of quantum systems.

For the exam, make sure you can explain these concepts clearly and work through basic Schrödinger equation problems. We'll have more practice problems in the next class.`,
    },
    {
      id: '3',
      title: 'Key Terms & Definitions',
      type: 'key_terms',
      content: `# Key Terms & Definitions

**Quantum Mechanics**
The branch of physics that deals with the behavior of matter and energy at the atomic and subatomic scale, where classical mechanics no longer applies.

**Wave-Particle Duality**
The concept that all matter and energy exhibit both wave-like and particle-like properties depending on the experimental conditions.

**Schrödinger Equation**
The fundamental equation of quantum mechanics that describes how the quantum state of a physical system changes with time.

**Wave Function (ψ)**
A mathematical function that describes the quantum state of a system. The square of its amplitude gives the probability of finding a particle in a particular state.

**Hamiltonian Operator (Ĥ)**
An operator in quantum mechanics that corresponds to the total energy of the system.

**Reduced Planck Constant (ℏ)**
A fundamental physical constant equal to the Planck constant divided by 2π, approximately 1.054 × 10⁻³⁴ J·s.

**Observer Effect**
The phenomenon in quantum mechanics where the act of observation changes the state of the system being observed.

**Photoelectric Effect**
The emission of electrons from a material when light shines on it, which provided early evidence for the particle nature of light.

**Double-Slit Experiment**
A demonstration that light and matter can display characteristics of both waves and particles, and that observation affects the outcome.`,
    },
    {
      id: '4',
      title: 'Study Questions',
      type: 'study_questions',
      content: `# Study Questions

## Conceptual Understanding

1. **Explain wave-particle duality in your own words. What experimental evidence supports this concept?**

2. **What is the significance of the Schrödinger equation in quantum mechanics? What information does the wave function provide?**

3. **Describe the observer effect. Why is it significant that observation affects quantum systems?**

4. **How does quantum mechanics differ from classical mechanics? In what situations does classical mechanics fail?**

## Application Questions

5. **In the double-slit experiment, what happens when you observe which slit the particle goes through? Why does this happen?**

6. **What are the key components of the Schrödinger equation (iℏ ∂ψ/∂t = Ĥψ)? What does each symbol represent?**

7. **Give an example of a phenomenon that can only be explained by quantum mechanics, not classical physics.**

## Exam Preparation

8. **The professor mentioned that these concepts will be on the midterm. What are the three main topics you should focus on studying?**

9. **What practical applications of the Schrödinger equation should you be prepared to work through?**

10. **Create your own example to demonstrate the wave-particle duality of light or matter.**`,
    },
  ];

  const documents: Document[] = openedFile?.title
    ? [
        {
          id: 'opened-file',
          title: openedFile.title,
          type: 'generated_summary',
          content: openedFile.content ?? '',
          generated: true,
        },
      ]
    : defaultDocuments;

  const activeDocId = documents.some((doc) => doc.id === selectedDocId) ? selectedDocId : documents[0]?.id ?? '';
  const selectedDoc = documents.find((doc) => doc.id === activeDocId);

  return (
    <div className="min-h-screen bg-background text-foreground flex">
      <div className="w-80 shrink-0 bg-card border-r border-border">
        <div className="p-6">
          <div className="mb-6">
            <h2 className="text-lg mb-1">{sessionName}</h2>
            <p className="text-sm text-muted-foreground">{sessionDate}</p>
          </div>

          <div className="space-y-2">
            {documents.map((doc) => (
              <button
                key={doc.id}
                onClick={() => setSelectedDocId(doc.id)}
                className={`w-full text-left px-4 py-3 rounded-lg transition-colors ${
                  activeDocId === doc.id
                    ? 'border'
                    : 'hover:bg-accent hover:text-accent-foreground'
                }`}
                style={activeDocId === doc.id ? {
                  backgroundColor: 'var(--brand-soft-bg)',
                  color: 'var(--brand-deep)',
                  borderColor: 'var(--brand-soft-border)'
                } : {}}
              >
                {doc.title}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col">
        <div className="bg-card border-b border-border px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/home')}
              className="px-4 py-2 border border-border rounded-lg hover:bg-accent hover:text-accent-foreground"
            >
              ← Back to Home
            </button>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <img
              src={logo}
              alt="ClassroomCompanion"
              className="h-10 w-auto"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-8">
          <div className="max-w-3xl mx-auto">
            <div className="bg-card border border-border rounded-lg shadow-sm p-12">
              {selectedDoc ? (
                <div className="prose prose-sm max-w-none">
                  {selectedDoc.content.split('\n').map((line, index) => {
                    if (line.startsWith('# ')) {
                      return (
                        <h1 key={index} className="text-3xl mt-8 mb-4 first:mt-0">
                          {line.substring(2)}
                        </h1>
                      );
                    }
                    if (line.startsWith('## ')) {
                      return (
                        <h2 key={index} className="text-2xl mt-6 mb-3">
                          {line.substring(3)}
                        </h2>
                      );
                    }
                    if (line.startsWith('### ')) {
                      return (
                        <h3 key={index} className="text-xl mt-4 mb-2">
                          {line.substring(4)}
                        </h3>
                      );
                    }
                    if (line.startsWith('**') && line.endsWith('**')) {
                      return (
                        <p key={index} className="mt-4 mb-2">
                          <strong>{line.slice(2, -2)}</strong>
                        </p>
                      );
                    }
                    if (line.trim() === '') {
                      return <div key={index} className="h-4" />;
                    }
                    return (
                      <p key={index} className="mb-3 leading-relaxed">
                        {line}
                      </p>
                    );
                  })}
                </div>
              ) : (
                <p className="text-muted-foreground text-center">
                  Select a document to view
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
