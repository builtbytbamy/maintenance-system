import React, { useState, useEffect } from 'react';
import { Search, Filter, Calendar, MapPin, AlertCircle, CheckCircle2, Clock, XCircle, Eye, UserPlus, FileText, UserCheck, ShieldAlert, Wrench } from 'lucide-react';
import { API_URL } from '../App';

export default function AdminDashboard({ user, wsUpdateTrigger, showToast }) {
    const [requests, setRequests] = useState([]);
    const [categories, setCategories] = useState([]);
    const [officers, setOfficers] = useState([]);
    const [loading, setLoading] = useState(true);

    // Filter/Search State
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('');
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);

    // Detail Modal State
    const [selectedRequest, setSelectedRequest] = useState(null);
    const [selectedLogs, setSelectedLogs] = useState([]);
    const [showDetailModal, setShowDetailModal] = useState(false);

    // Assign Modal State
    const [showAssignModal, setShowAssignModal] = useState(false);
    const [assignOfficerId, setAssignOfficerId] = useState('');
    const [assignLoading, setAssignLoading] = useState(false);
    const [assignError, setAssignError] = useState('');

    // Register Officer Modal State
    const [showRegisterModal, setShowRegisterModal] = useState(false);
    const [regName, setRegName] = useState('');
    const [regEmail, setRegEmail] = useState('');
    const [regPassword, setRegPassword] = useState('');
    const [regRole, setRegRole] = useState('officer');
    const [regLoading, setRegLoading] = useState(false);
    const [regError, setRegError] = useState('');
    const [regSuccess, setRegSuccess] = useState('');

    // Audit Logs State
    const [showLogsModal, setShowLogsModal] = useState(false);
    const [logs, setLogs] = useState([]);
    const [logsLoading, setLogsLoading] = useState(false);

    useEffect(() => {
        fetchCategories();
        fetchOfficers();
        fetchRequests();
    }, [search, statusFilter, categoryFilter, page, wsUpdateTrigger]);

    const fetchCategories = async () => {
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${API_URL}/categories`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setCategories(data);
            }
        } catch (err) {
            console.error('Failed to fetch categories:', err);
        }
    };

    const fetchOfficers = async () => {
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${API_URL}/users?role=officer`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setOfficers(data);
            }
        } catch (err) {
            console.error('Failed to fetch officers:', err);
        }
    };

    const fetchRequests = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('token');
            const queryParams = new URLSearchParams({
                search,
                status: statusFilter,
                category_id: categoryFilter,
                page: page.toString(),
                limit: '6'
            });
            const res = await fetch(`${API_URL}/requests?${queryParams}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setRequests(data.requests || []);
                setTotalPages(data.pagination.pages || 1);
            }
        } catch (err) {
            console.error('Failed to fetch requests:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleViewDetails = async (reqId) => {
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${API_URL}/requests/${reqId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setSelectedRequest(data.request);
                setSelectedLogs(data.logs || []);
                setShowDetailModal(true);
            }
        } catch (err) {
            console.error('Failed to fetch request details:', err);
        }
    };

    const handleOpenAssignModal = (req) => {
        setSelectedRequest(req);
        setAssignOfficerId(req.officer_id || '');
        setAssignError('');
        setShowAssignModal(true);
    };

    const handleAssignRequest = async (e) => {
        e.preventDefault();
        setAssignError('');
        setAssignLoading(true);

        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${API_URL}/requests/${selectedRequest.id}/assign`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ officer_id: parseInt(assignOfficerId) })
            });

            const data = await res.json();
            if (res.ok) {
                setShowAssignModal(false);
                fetchRequests();
                if (showDetailModal && selectedRequest.id) {
                    handleViewDetails(selectedRequest.id);
                }
                showToast('Request assigned successfully!');
            } else {
                setAssignError(data.error || 'Failed to assign request');
                showToast(data.error || 'Failed to assign request', 'error');
            }
        } catch (err) {
            setAssignError('Failed to connect to server. Please try again.');
        } finally {
            setAssignLoading(false);
        }
    };

    const handleRegisterUser = async (e) => {
        e.preventDefault();
        setRegError('');
        setRegSuccess('');
        setRegLoading(true);

        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${API_URL}/admin/register`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ name: regName, email: regEmail, password: regPassword, role: regRole })
            });

            const data = await res.json();
            if (res.ok) {
                setRegSuccess('User registered successfully!');
                setRegName('');
                setRegEmail('');
                setRegPassword('');
                fetchOfficers();
                showToast('User registered successfully!');
                setTimeout(() => {
                    setShowRegisterModal(false);
                    setRegSuccess('');
                }, 1500);
            } else {
                setRegError(data.error || 'Failed to register user');
                showToast(data.error || 'Failed to register user', 'error');
            }
        } catch (err) {
            setRegError('Failed to connect to server. Please try again.');
        } finally {
            setRegLoading(false);
        }
    };

    const handleExportCSV = async () => {
        try {
            const token = localStorage.getItem('token');
            const queryParams = new URLSearchParams({
                search,
                status: statusFilter,
                category_id: categoryFilter
            });
            const res = await fetch(`${API_URL}/admin/export?${queryParams}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const blob = await res.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'maintenance_requests_report.csv';
                document.body.appendChild(a);
                a.click();
                a.remove();
            }
        } catch (err) {
            console.error('Failed to export CSV:', err);
        }
    };

    const handleExportPDF = async () => {
        try {
            const token = localStorage.getItem('token');
            const queryParams = new URLSearchParams({
                search,
                status: statusFilter,
                category_id: categoryFilter
            });
            const res = await fetch(`${API_URL}/admin/export/pdf?${queryParams}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const blob = await res.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'maintenance_requests_report.pdf';
                document.body.appendChild(a);
                a.click();
                a.remove();
            }
        } catch (err) {
            console.error('Failed to export PDF:', err);
        }
    };

    const fetchLogs = async () => {
        setLogsLoading(true);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${API_URL}/admin/activity-logs`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setLogs(data);
            }
        } catch (err) {
            console.error('Failed to fetch activity logs:', err);
        } finally {
            setLogsLoading(false);
        }
    };

    const getStatusIcon = (status) => {
        switch (status) {
            case 'pending': return <Clock size={16} />;
            case 'assigned': return <AlertCircle size={16} />;
            case 'in_progress': return <Wrench size={16} />;
            case 'completed': return <CheckCircle2 size={16} />;
            case 'rejected': return <XCircle size={16} />;
            default: return null;
        }
    };

    return (
        <div className="container animate-fade-in">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <div>
                    <h1 style={{ fontSize: '2rem', marginBottom: '0.25rem' }}>Admin Control Panel</h1>
                    <p style={{ color: 'var(--text-secondary)' }}>Manage requests, assign tasks, and register staff/officers</p>
                </div>
                <div style={{ display: 'flex', gap: '1rem' }}>
                    <button className="btn btn-secondary" onClick={() => { fetchLogs(); setShowLogsModal(true); }}>
                        <ShieldAlert size={18} />
                        View Audit Logs
                    </button>
                    <button className="btn btn-primary" onClick={() => setShowRegisterModal(true)}>
                        <UserPlus size={18} />
                        Register Officer/Admin
                    </button>
                </div>
            </div>

            {/* Filters and Search */}
            <div className="glass-card" style={{ padding: '1.25rem', marginBottom: '2rem', display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center' }}>
                <div style={{ flex: 1, minWidth: '250px', position: 'relative' }}>
                    <Search size={18} color="var(--text-muted)" style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)' }} />
                    <input
                        type="text"
                        className="form-input"
                        placeholder="Search all requests..."
                        value={search}
                        onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                        style={{ paddingLeft: '2.75rem' }}
                    />
                </div>
                <div style={{ minWidth: '150px' }}>
                    <select
                        className="form-select"
                        value={statusFilter}
                        onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
                    >
                        <option value="">All Statuses</option>
                        <option value="pending">Pending</option>
                        <option value="assigned">Assigned</option>
                        <option value="in_progress">In Progress</option>
                        <option value="completed">Completed</option>
                        <option value="rejected">Rejected</option>
                    </select>
                </div>
                <div style={{ minWidth: '180px' }}>
                    <select
                        className="form-select"
                        value={categoryFilter}
                        onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}
                    >
                        <option value="">All Categories</option>
                        {categories.map(cat => (
                            <option key={cat.id} value={cat.id}>{cat.name}</option>
                        ))}
                    </select>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', borderLeft: '1px solid var(--border-glass)', paddingLeft: '1rem' }}>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginRight: '0.5rem' }}>Export Current View:</span>
                    <button className="btn btn-secondary" style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }} onClick={handleExportCSV}>
                        <FileText size={16} />
                        CSV
                    </button>
                    <button className="btn btn-secondary" style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }} onClick={handleExportPDF}>
                        <FileText size={16} />
                        PDF
                    </button>
                </div>
            </div>

            {/* Requests Grid */}
            {loading ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>Loading requests...</div>
            ) : requests.length === 0 ? (
                <div className="glass-card" style={{ textAlign: 'center', padding: '4rem 2rem', color: 'var(--text-secondary)' }}>
                    <AlertCircle size={48} color="var(--text-muted)" style={{ marginBottom: '1rem' }} />
                    <h3>No requests found</h3>
                </div>
            ) : (
                <>
                    <div className="grid grid-cols-3">
                        {requests.map(req => (
                            <div key={req.id} className="glass-card animate-fade-in" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '230px' }}>
                                <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                                        <span className={`badge badge-${req.status}`} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                            {getStatusIcon(req.status)}
                                            {req.status}
                                        </span>
                                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                            <Calendar size={12} />
                                            {new Date(req.created_at).toLocaleDateString()}
                                        </span>
                                    </div>
                                    <h3 style={{ fontSize: '1.2rem', marginBottom: '0.5rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{req.title}</h3>
                                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '0.5rem', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                        {req.description}
                                    </p>
                                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Reporter: {req.reporter?.name || 'N/A'}</p>
                                    {req.officer_name && (
                                        <p style={{ fontSize: '0.8rem', color: 'var(--primary)', fontWeight: 500 }}>Officer: {req.officer_name}</p>
                                    )}
                                </div>
                                <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem', color: 'var(--text-muted)', borderTop: '1px solid var(--border-glass)', paddingTop: '1rem', marginTop: '1rem' }}>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                            <MapPin size={14} />
                                            {req.location}
                                        </span>
                                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                                            <button className="btn btn-secondary" style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }} onClick={() => handleViewDetails(req.id)}>
                                                <Eye size={14} />
                                                Details
                                            </button>
                                            <button className="btn btn-primary" style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }} onClick={() => handleOpenAssignModal(req)}>
                                                <UserCheck size={14} />
                                                Assign
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginTop: '2rem' }}>
                            <button
                                className="btn btn-secondary"
                                disabled={page === 1}
                                onClick={() => setPage(page - 1)}
                                style={{ padding: '0.5rem 1rem' }}
                            >
                                Previous
                            </button>
                            <span style={{ display: 'flex', alignItems: 'center', padding: '0 1rem', color: 'var(--text-secondary)' }}>
                                Page {page} of {totalPages}
                            </span>
                            <button
                                className="btn btn-secondary"
                                disabled={page === totalPages}
                                onClick={() => setPage(page + 1)}
                                style={{ padding: '0.5rem 1rem' }}
                            >
                                Next
                            </button>
                        </div>
                    )}
                </>
            )}

            {/* Detail Modal */}
            {showDetailModal && selectedRequest && (
                <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowDetailModal(false)}>
                    <div className="modal-content" style={{ maxWidth: '600px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
                            <div>
                                <span className={`badge badge-${selectedRequest.status}`} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', width: 'fit-content', marginBottom: '0.5rem' }}>
                                    {getStatusIcon(selectedRequest.status)}
                                    {selectedRequest.status}
                                </span>
                                <h2>{selectedRequest.title}</h2>
                            </div>
                            <button className="btn btn-secondary" style={{ padding: '0.25rem 0.5rem' }} onClick={() => setShowDetailModal(false)}>X</button>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem', padding: '1rem', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: 'var(--radius-md)' }}>
                            <div>
                                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Category</span>
                                <p style={{ fontWeight: 500 }}>{selectedRequest.category?.name || 'N/A'}</p>
                            </div>
                            <div>
                                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Location</span>
                                <p style={{ fontWeight: 500 }}>{selectedRequest.location}</p>
                            </div>
                            <div>
                                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Priority</span>
                                <p style={{ fontWeight: 500, textTransform: 'capitalize' }}>{selectedRequest.priority}</p>
                            </div>
                            <div>
                                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Submitted At</span>
                                <p style={{ fontWeight: 500 }}>{new Date(selectedRequest.created_at).toLocaleString()}</p>
                            </div>
                            <div>
                                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Reporter</span>
                                <p style={{ fontWeight: 500 }}>{selectedRequest.reporter?.name || 'N/A'}</p>
                            </div>
                            {selectedRequest.officer_name && (
                                <div>
                                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Assigned Officer</span>
                                    <p style={{ fontWeight: 500, color: 'var(--primary)' }}>{selectedRequest.officer_name}</p>
                                </div>
                            )}
                        </div>

                        <div style={{ marginBottom: '1.5rem' }}>
                            <h4 style={{ marginBottom: '0.5rem' }}>Description</h4>
                            <p style={{ color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>{selectedRequest.description}</p>
                        </div>

                        {selectedRequest.image_url && (
                            <div style={{ marginBottom: '1.5rem' }}>
                                <h4 style={{ marginBottom: '0.5rem' }}>Evidence Attachment</h4>
                                <img
                                    src={`${API_URL.replace(/\/api$/, '')}${selectedRequest.image_url}`}
                                    alt="Evidence"
                                    style={{ width: '100%', maxHeight: '250px', objectFit: 'cover', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-glass)' }}
                                />
                            </div>
                        )}

                        <div style={{ marginBottom: '1.5rem' }}>
                            <h4 style={{ marginBottom: '1rem', borderBottom: '1px solid var(--border-glass)', paddingBottom: '0.5rem' }}>Status History & Activity Log</h4>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                {selectedLogs.map(log => (
                                    <div key={log.id} style={{ display: 'flex', gap: '1rem', fontSize: '0.9rem' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                            <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--primary)', marginTop: '6px' }}></div>
                                            <div style={{ flex: 1, width: '2px', backgroundColor: 'var(--border-glass)', margin: '4px 0' }}></div>
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                                                <span style={{ fontWeight: 600, textTransform: 'capitalize' }}>{log.status}</span>
                                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{new Date(log.created_at).toLocaleString()}</span>
                                            </div>
                                            <p style={{ color: 'var(--text-secondary)' }}>{log.notes}</p>
                                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Updated by: {log.updated_by_name || 'System'}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => handleOpenAssignModal(selectedRequest)}>
                            <UserCheck size={16} />
                            Assign / Reassign Task
                        </button>
                    </div>
                </div>
            )}

            {/* Assign Task Modal */}
            {showAssignModal && selectedRequest && (
                <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowAssignModal(false)}>
                    <div className="modal-content" style={{ maxWidth: '450px' }}>
                        <h2 style={{ marginBottom: '1.5rem' }}>Assign Maintenance Task</h2>
                        {assignError && (
                            <div style={{ backgroundColor: 'var(--danger-bg)', border: '1px solid var(--danger-border)', color: 'var(--danger)', padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
                                {assignError}
                            </div>
                        )}
                        <form onSubmit={handleAssignRequest}>
                            <div className="form-group">
                                <label className="form-label">Select Maintenance Officer</label>
                                <select
                                    className="form-select"
                                    value={assignOfficerId}
                                    onChange={(e) => setAssignOfficerId(e.target.value)}
                                    required
                                >
                                    <option value="">Select Officer</option>
                                    {officers.map(off => (
                                        <option key={off.id} value={off.id}>{off.name} ({off.email})</option>
                                    ))}
                                </select>
                            </div>
                            <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
                                <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowAssignModal(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={assignLoading}>
                                    {assignLoading ? 'Assigning...' : 'Assign Task'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Register Officer/Admin Modal */}
            {showRegisterModal && (
                <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowRegisterModal(false)}>
                    <div className="modal-content" style={{ maxWidth: '450px' }}>
                        <h2 style={{ marginBottom: '1.5rem' }}>Register Officer/Admin</h2>
                        {regError && (
                            <div style={{ backgroundColor: 'var(--danger-bg)', border: '1px solid var(--danger-border)', color: 'var(--danger)', padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
                                {regError}
                            </div>
                        )}
                        {regSuccess && (
                            <div style={{ backgroundColor: 'var(--success-bg)', border: '1px solid var(--success-border)', color: 'var(--success)', padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
                                {regSuccess}
                            </div>
                        )}
                        <form onSubmit={handleRegisterUser}>
                            <div className="form-group">
                                <label className="form-label">Full Name</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    placeholder="e.g., Officer John"
                                    value={regName}
                                    onChange={(e) => setRegName(e.target.value)}
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Email Address</label>
                                <input
                                    type="email"
                                    className="form-input"
                                    placeholder="officer@miva.edu.ng"
                                    value={regEmail}
                                    onChange={(e) => setRegEmail(e.target.value)}
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Password</label>
                                <input
                                    type="password"
                                    className="form-input"
                                    placeholder="••••••••"
                                    value={regPassword}
                                    onChange={(e) => setRegPassword(e.target.value)}
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Role</label>
                                <select
                                    className="form-select"
                                    value={regRole}
                                    onChange={(e) => setRegRole(e.target.value)}
                                    required
                                >
                                    <option value="officer">Maintenance Officer</option>
                                    <option value="admin">Administrator</option>
                                </select>
                            </div>
                            <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
                                <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowRegisterModal(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={regLoading}>
                                    {regLoading ? 'Registering...' : 'Register User'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Audit Logs Modal */}
            {showLogsModal && (
                <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowLogsModal(false)}>
                    <div className="modal-content" style={{ maxWidth: '800px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                            <h2>System Audit Logs</h2>
                            <button className="btn btn-secondary" style={{ padding: '0.25rem 0.5rem' }} onClick={() => setShowLogsModal(false)}>Close</button>
                        </div>
                        {logsLoading ? (
                            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>Loading logs...</div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                {logs.length === 0 ? (
                                    <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '1rem' }}>No activity logs found</div>
                                ) : (
                                    <div style={{ overflowX: 'auto' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                                            <thead>
                                                <tr style={{ borderBottom: '1px solid var(--border-glass)', textAlign: 'left' }}>
                                                    <th style={{ padding: '0.75rem' }}>User</th>
                                                    <th style={{ padding: '0.75rem' }}>Action</th>
                                                    <th style={{ padding: '0.75rem' }}>Details</th>
                                                    <th style={{ padding: '0.75rem' }}>Timestamp</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {logs.map(log => (
                                                    <tr key={log.id} style={{ borderBottom: '1px solid var(--border-glass)' }}>
                                                        <td style={{ padding: '0.75rem', color: 'var(--primary)' }}>{log.user_name || 'System'}</td>
                                                        <td style={{ padding: '0.75rem', fontWeight: 600 }}>{log.action}</td>
                                                        <td style={{ padding: '0.75rem', color: 'var(--text-secondary)' }}>{log.details}</td>
                                                        <td style={{ padding: '0.75rem', color: 'var(--text-muted)' }}>{new Date(log.created_at).toLocaleString()}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
