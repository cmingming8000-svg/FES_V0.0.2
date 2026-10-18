import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { store } from '../store';
import { errorMessage } from '../api/client';
import type { UserRole } from '../types';
import { ROLE_LABELS_LONG } from '../utils/terminology';
import BulkImport from '../components/BulkImport';
import { UserPlus, ArrowLeft, CheckCircle, AlertCircle } from 'lucide-react';

const ROLES: UserRole[] = ['faculty', 'student', 'dean', 'hr_qa'];
const TITLES = ['Professor', 'Associate Professor', 'Assistant Professor', 'Instructor', 'Lecturer'];
const EMPTY_FORM = { name: '', institutionalId: '', email: '', username: '', password: '', confirmPassword: '', department: '', title: '', programId: '', subjects: [] as string[] };

const inputClass = 'w-full px-3 py-2 rounded-lg border text-sm outline-none';
const inputStyle = { backgroundColor: '#F8F6F1', borderColor: '#D5D8DC' };

export default function AccountCreation() {
  const navigate = useNavigate();
  const [selectedRole, setSelectedRole] = useState<UserRole>('faculty');
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const programs = store.getPrograms();
  const subjects = store.getSubjects();
  const departments = store.getDepartments();

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => { const { name, value } = e.target; setFormData(prev => ({ ...prev, [name]: value })); };
  const toggleSubject = (id: string) => setFormData(prev => ({ ...prev, subjects: prev.subjects.includes(id) ? prev.subjects.filter(s => s !== id) : [...prev.subjects, id] }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    if (formData.password && formData.password !== formData.confirmPassword) { setMessage({ type: 'error', text: 'Passwords do not match' }); return; }
    setIsSubmitting(true);
    try {
      const result = await store.createAccount({
        role: selectedRole,
        name: formData.name.trim(),
        institutionalId: formData.institutionalId.trim(),
        email: formData.email.trim(),
        username: formData.username.trim() || undefined,
        password: formData.password || undefined,
        department: selectedRole === 'faculty' || selectedRole === 'dean' ? formData.department : undefined,
        title: selectedRole === 'faculty' ? formData.title : undefined,
        programId: selectedRole === 'student' ? formData.programId : undefined,
        subjects: selectedRole === 'faculty' || selectedRole === 'student' ? formData.subjects : undefined,
      });
      setMessage({ type: 'success', text: `${result.message} Username: ${result.username}` });
      setFormData(EMPTY_FORM);
    } catch (err) {
      setMessage({ type: 'error', text: errorMessage(err) });
    } finally {
      setIsSubmitting(false);
    }
  };

  const subjectChoices = selectedRole === 'student' && formData.programId ? subjects.filter(s => s.programId === formData.programId) : subjects;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4"><button onClick={() => navigate('/')} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90" style={{ backgroundColor: '#D5D8DC', color: '#1A1A1A' }}><ArrowLeft size={16} />Back to Dashboard</button><h2 className="text-2xl font-bold" style={{ color: '#002366' }}>Account Management</h2></div>
      <div className="rounded-xl p-6 shadow-sm" style={{ backgroundColor: '#EDEBE8' }}>
        <h3 className="text-sm font-semibold mb-4" style={{ color: '#002366' }}>Create a Single Account</h3>
        <div className="mb-6"><label className="block text-sm font-medium mb-3">Account Type *</label><div className="grid grid-cols-2 md:grid-cols-4 gap-3">{ROLES.map(role => (<button key={role} type="button" onClick={() => setSelectedRole(role)} className="px-4 py-3 rounded-lg text-sm font-medium" style={{ backgroundColor: selectedRole === role ? '#002366' : '#F8F6F1', color: selectedRole === role ? '#FFFFFF' : '#1A1A1A', border: selectedRole === role ? '2px solid #002366' : '2px solid #D5D8DC' }}>{ROLE_LABELS_LONG[role]}</button>))}</div></div>
        {message && (<div role={message.type === 'error' ? 'alert' : 'status'} className="mb-6 p-4 rounded-lg flex items-start gap-3" style={{ backgroundColor: message.type === 'success' ? '#D1FAE5' : '#FEE2E2', border: `1px solid ${message.type === 'success' ? '#2E8B57' : '#C41E3A'}` }}>{message.type === 'success' ? <CheckCircle size={20} style={{ color: '#2E8B57' }} /> : <AlertCircle size={20} style={{ color: '#C41E3A' }} />}<p className="text-sm" style={{ color: message.type === 'success' ? '#2E8B57' : '#C41E3A' }}>{message.text}</p></div>)}
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium mb-2">Full Name *</label><input type="text" name="name" value={formData.name} onChange={handleInputChange} className={inputClass} style={inputStyle} required /></div>
            <div><label className="block text-sm font-medium mb-2">{selectedRole === 'student' ? 'Student ID' : 'Employee Number'} *</label><input type="text" name="institutionalId" value={formData.institutionalId} onChange={handleInputChange} className={inputClass} style={inputStyle} placeholder={selectedRole === 'student' ? 'C25-001' : selectedRole === 'faculty' ? 'F120' : selectedRole === 'dean' ? 'M010' : 'HR-0102'} required /></div>
            <div><label className="block text-sm font-medium mb-2">Institutional Email *</label><input type="email" name="email" value={formData.email} onChange={handleInputChange} className={inputClass} style={inputStyle} placeholder="name@school.edu.ph" required /></div>
            {(selectedRole === 'faculty' || selectedRole === 'dean') && (<div><label className="block text-sm font-medium mb-2">Department *</label><select name="department" value={formData.department} onChange={handleInputChange} className={inputClass} style={inputStyle} required><option value="">Select Department</option>{departments.map(d => <option key={d} value={d}>{d}</option>)}</select></div>)}
            {selectedRole === 'faculty' && (<div><label className="block text-sm font-medium mb-2">Title *</label><select name="title" value={formData.title} onChange={handleInputChange} className={inputClass} style={inputStyle} required><option value="">Select Title</option>{TITLES.map(t => <option key={t} value={t}>{t}</option>)}</select></div>)}
            {selectedRole === 'student' && (<div><label className="block text-sm font-medium mb-2">Program *</label><select name="programId" value={formData.programId} onChange={handleInputChange} className={inputClass} style={inputStyle} required><option value="">Select Program</option>{programs.map(p => (<option key={p.id} value={p.id}>{p.name}</option>))}</select></div>)}
          </div>
          {(selectedRole === 'faculty' || selectedRole === 'student') && (
            <div>
              <label className="block text-sm font-medium mb-2">{selectedRole === 'faculty' ? 'Courses Taught' : 'Enrolled Subjects'}</label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 max-h-40 overflow-y-auto p-2 rounded-lg" style={{ backgroundColor: '#F8F6F1' }}>
                {subjectChoices.map(s => (<label key={s.id} className="flex items-center gap-2 text-xs cursor-pointer"><input type="checkbox" checked={formData.subjects.includes(s.id)} onChange={() => toggleSubject(s.id)} />{s.code} — {s.name}</label>))}
              </div>
            </div>
          )}
          <div className="border-t pt-6" style={{ borderColor: '#D5D8DC' }}>
            <h3 className="text-sm font-semibold mb-1" style={{ color: '#002366' }}>Login Credentials</h3>
            <p className="text-xs mb-4" style={{ color: '#6B7280' }}>Leave the password blank to email the user a secure invitation to set their own password (recommended). Passwords are stored only as salted Argon2id hashes.</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div><label className="block text-sm font-medium mb-2">Username</label><input type="text" name="username" value={formData.username} onChange={handleInputChange} className={inputClass} style={inputStyle} placeholder="Defaults to the ID" autoComplete="off" /></div>
              <div><label className="block text-sm font-medium mb-2">Initial Password</label><input type="password" name="password" value={formData.password} onChange={handleInputChange} className={inputClass} style={inputStyle} autoComplete="new-password" minLength={10} /></div>
              <div><label className="block text-sm font-medium mb-2">Confirm Password</label><input type="password" name="confirmPassword" value={formData.confirmPassword} onChange={handleInputChange} className={inputClass} style={inputStyle} autoComplete="new-password" disabled={!formData.password} /></div>
            </div>
          </div>
          <button type="submit" disabled={isSubmitting} className="w-full py-3 rounded-lg font-semibold text-white flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-50" style={{ backgroundColor: '#002366' }}>{isSubmitting ? <><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />Creating Account...</> : <><UserPlus size={18} />Create Account</>}</button>
        </form>
      </div>
      <BulkImport />
    </div>
  );
}
