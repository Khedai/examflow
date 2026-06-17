import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AppProvider } from './context/AppContext';

import Landing from './pages/Landing';
import TeacherLogin from './pages/teacher/TeacherLogin';
import TeacherDashboard from './pages/teacher/TeacherDashboard';
import ExamList from './pages/teacher/ExamList';
import ExamEditor from './pages/teacher/ExamEditor';
import ExamDetail from './pages/teacher/ExamDetail';
import SubmissionList from './pages/teacher/SubmissionList';
import MarkingView from './pages/teacher/MarkingView';
import StudentDashboard from './pages/student/StudentDashboard';
import ExamTaking from './pages/student/ExamTaking';
import ResultsView from './pages/student/ResultsView';

function TeacherRoute({ children }: { children: React.ReactNode }) {
  const { role } = useAuth();
  if (role !== 'teacher') return <Navigate to="/" replace />;
  return <>{children}</>;
}

function StudentRoute({ children }: { children: React.ReactNode }) {
  const { role } = useAuth();
  if (role !== 'student') return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <AppProvider>
        <BrowserRouter
          future={{
            v7_relativeSplatPath: true,
            v7_startTransition: true,
          }}
        >
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/teacher/login" element={<TeacherLogin />} />
            <Route
              path="/teacher"
              element={
                <TeacherRoute>
                  <TeacherDashboard />
                </TeacherRoute>
              }
            />
            <Route
              path="/teacher/exams"
              element={
                <TeacherRoute>
                  <ExamList />
                </TeacherRoute>
              }
            />
            <Route
              path="/teacher/exams/new"
              element={
                <TeacherRoute>
                  <ExamEditor />
                </TeacherRoute>
              }
            />
            <Route
              path="/teacher/exams/:id"
              element={
                <TeacherRoute>
                  <ExamDetail />
                </TeacherRoute>
              }
            />
            <Route
              path="/teacher/exams/:id/edit"
              element={
                <TeacherRoute>
                  <ExamEditor />
                </TeacherRoute>
              }
            />
            <Route
              path="/teacher/submissions"
              element={
                <TeacherRoute>
                  <SubmissionList />
                </TeacherRoute>
              }
            />
            <Route
              path="/teacher/submissions/:id"
              element={
                <TeacherRoute>
                  <MarkingView />
                </TeacherRoute>
              }
            />
            <Route
              path="/student"
              element={
                <StudentRoute>
                  <StudentDashboard />
                </StudentRoute>
              }
            />
            <Route
              path="/student/exam/:examId"
              element={
                <StudentRoute>
                  <ExamTaking />
                </StudentRoute>
              }
            />
            <Route
              path="/student/result/:submissionId"
              element={
                <StudentRoute>
                  <ResultsView />
                </StudentRoute>
              }
            />
          </Routes>
        </BrowserRouter>
      </AppProvider>
    </AuthProvider>
  );
}