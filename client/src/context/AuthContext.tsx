import React, { createContext, useContext, useState } from 'react';
import type { Student } from '../types';

interface AuthState {
  role: 'none' | 'teacher' | 'student';
  student: Student | null;
}

interface AuthContextValue extends AuthState {
  loginTeacher: (token: string) => void;
  loginStudent: (token: string, student: Student) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue>(null!);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>(() => {
    const tt = localStorage.getItem('teacher_token');
    const st = localStorage.getItem('student_token');
    const sv = localStorage.getItem('student_data');
    if (tt) return { role: 'teacher', student: null };
    if (st && sv) {
      try {
        return { role: 'student', student: JSON.parse(sv) };
      } catch {
        localStorage.removeItem('student_token');
        localStorage.removeItem('student_data');
      }
    }
    return { role: 'none', student: null };
  });

  const loginTeacher = (token: string) => {
    localStorage.setItem('teacher_token', token);
    localStorage.removeItem('student_token');
    localStorage.removeItem('student_data');
    setState({ role: 'teacher', student: null });
  };

  const loginStudent = (token: string, student: Student) => {
    localStorage.setItem('student_token', token);
    localStorage.setItem('student_data', JSON.stringify(student));
    localStorage.removeItem('teacher_token');
    setState({ role: 'student', student });
  };

  const logout = () => {
    localStorage.clear();
    setState({ role: 'none', student: null });
  };

  return (
    <AuthContext.Provider value={{ ...state, loginTeacher, loginStudent, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);