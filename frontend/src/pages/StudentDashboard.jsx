import React, { useState, useEffect } from 'react';
import { Plus, Search, Filter, Calendar, MapPin, AlertCircle, CheckCircle2, Clock, XCircle, Eye, Image as ImageIcon, Wrench } from 'lucide-react';
import { API_URL } from '../App';

export default function StudentDashboard({ user, wsUpdateTrigger, showToast }) {
    const [requests, setRequests] = useState([]);
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);

    // Form State
    const [showSubmitModal, setShowSubmitModal] = useState(false);
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [categoryId, setCategoryId] = useState('');
    const [priority, setPriority] = useState('medium');
    const [location, setLocation] = useState('');
    const [imageFile, setImageFile] = useState(null);
    const [submitLoading, setSubmitLoading] = useState(false);
    const [formError, setFormError] = useState('');

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

    useEffect(() => {
        fetchCategories();
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

    const handleFileChange = (e) => {
        if (e.target.files && e.target.files[0]) {
            setImageFile(e.target.files[0]);
        }
    };

    const handleSubmitRequest = async (e) => {
        e.preventDefault();
        setFormError('');
        setSubmitLoading(true);

        const formData = new FormData();
        formData.append('title', title);
        formData.append('description', description);
        formData.append('category_id', categoryId);
        formData.append('priority', priority);
        formData.append('location', location);
        if (imageFile) {
            formData.append('image', imageFile);
        }

        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${API_URL}/requests`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: formData
            });

            const data = await res.json();
            if (res.ok) {
                setShowSubmitModal(false);
                // Reset form
                setTitle('');
                setDescription('');
                setCategoryId('');
                setPriority('medium');
                setLocation('');
                setImageFile(null);
                fetchRequests();
                showToast('Request submitted successfully!');
            } else {
                setFormError(data.error || 'Failed to submit request');
                showToast(data.error || 'Failed to submit request', 'error');
            }
        } catch (err) {
            setFormError('Failed to connect to server. Please try again.');
        } finally {
            setSubmitLoading(false);
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
                    <h1 style={{ fontSize: '2rem', marginBottom: '0.25rem' }}>My Service Requests</h1>
                    <p style={{ color: 'var(--text-secondary)' }}>Submit and track your maintenance requests</p>
                </div>
                <button className="btn btn-primary" onClick={() => setShowSubmitModal(true)}>
                    <Plus size={18} />
                    New Request
                </button>
            </div>

            {/* Filters and Search */}
            <div className="glass-card" style={{ padding: '1.25rem', marginBottom: '2rem', display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center' }}>
                <div style={{ flex: 1, minWidth: '250px', position: 'relative' }}>
                    <Search size={18} color="var(--text-muted)" style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)' }} />
                    <input
                        type="text"
                        className="form-input"
                        placeholder="Search requests..."
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
            </div>

            {/* Requests Grid */}
            {loading ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>Loading requests...</div>
            ) : requests.length === 0 ? (
                <div className="glass-card" style={{ textAlign: 'center', padding: '4rem 2rem', color: 'var(--text-secondary)' }}>
                    <AlertCircle size={48} color="var(--text-muted)" style={{ marginBottom: '1rem' }} />
                    <h3>No requests found</h3>
                    <p style={{ marginTop: '0.5rem' }}>Submit a new request to get started.</p>
                </div>
            ) : (
                <>
                    <div className="grid grid-cols-3">
                        {requests.map(req => (
                            <div key={req.id} className="glass-card animate-fade-in" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '220px' }}>
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
                                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1rem', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                        {req.description}
                                    </p>
                                </div>
                                <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem', color: 'var(--text-muted)', borderTop: '1px solid var(--border-glass)', paddingTop: '1rem', marginTop: '1rem' }}>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                            <MapPin size={14} />
                                            {req.location}
                                        </span>
                                        <button className="btn btn-secondary" style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }} onClick={() => handleViewDetails(req.id)}>
                                            <Eye size={14} />
                                            Details
                                        </button>
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

            {/* Submit Request Modal */}
            {showSubmitModal && (
                <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowSubmitModal(false)}>
                    <div className="modal-content" style={{ maxWidth: '500px' }}>
                        <h2 style={{ marginBottom: '1.5rem' }}>Submit Maintenance Request</h2>
                        {formError && (
                            <div style={{ backgroundColor: 'var(--danger-bg)', border: '1px solid var(--danger-border)', color: 'var(--danger)', padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
                                {formError}
                            </div>
                        )}
                        <form onSubmit={handleSubmitRequest}>
                            <div className="form-group">
                                <label className="form-label">Title</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    placeholder="e.g., Leaking pipe in Hostel Room 204"
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Category</label>
                                <select
                                    className="form-select"
                                    value={categoryId}
                                    onChange={(e) => setCategoryId(e.target.value)}
                                    required
                                >
                                    <option value="">Select Category</option>
                                    {categories.map(cat => (
                                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="form-group">
                                <label className="form-label">Location</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    placeholder="e.g., Hostel Block A, Room 204"
                                    value={location}
                                    onChange={(e) => setLocation(e.target.value)}
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Priority</label>
                                <select
                                    className="form-select"
                                    value={priority}
                                    onChange={(e) => setPriority(e.target.value)}
                                    required
                                >
                                    <option value="low">Low</option>
                                    <option value="medium">Medium</option>
                                    <option value="high">High</option>
                                </select>
                            </div>
                            <div className="form-group">
                                <label className="form-label">Description</label>
                                <textarea
                                    className="form-textarea"
                                    placeholder="Describe the issue in detail..."
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Evidence Image (Optional)</label>
                                <input
                                    type="file"
                                    accept="image/*"
                                    className="form-input"
                                    onChange={handleFileChange}
                                />
                            </div>
                            <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
                                <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowSubmitModal(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={submitLoading}>
                                    {submitLoading ? 'Submitting...' : 'Submit'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
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
                            {selectedRequest.officer_name && (
                                <div style={{ gridColumn: 'span 2' }}>
                                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Assigned Maintenance Officer</span>
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

                        <div>
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
                    </div>
                </div>
            )}
        </div>
    );
}
