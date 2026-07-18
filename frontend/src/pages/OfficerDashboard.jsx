import React, { useState, useEffect } from 'react';
import { Search, Filter, Calendar, MapPin, AlertCircle, CheckCircle2, Clock, XCircle, Eye, Edit3, Wrench } from 'lucide-react';
import { API_URL } from '../App';

export default function OfficerDashboard({ user, wsUpdateTrigger, showToast }) {
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);

    // Filter/Search State
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);

    // Detail & Update Modal State
    const [selectedRequest, setSelectedRequest] = useState(null);
    const [selectedLogs, setSelectedLogs] = useState([]);
    const [showDetailModal, setShowDetailModal] = useState(false);
    const [showUpdateModal, setShowUpdateModal] = useState(false);

    // Update Status Form State
    const [newStatus, setNewStatus] = useState('in_progress');
    const [notes, setNotes] = useState('');
    const [updateLoading, setUpdateLoading] = useState(false);
    const [updateError, setUpdateError] = useState('');

    useEffect(() => {
        fetchRequests();
    }, [search, statusFilter, page, wsUpdateTrigger]);

    const fetchRequests = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('token');
            const queryParams = new URLSearchParams({
                search,
                status: statusFilter,
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

    const handleOpenUpdateModal = (req) => {
        setSelectedRequest(req);
        setNewStatus(req.status === 'assigned' ? 'in_progress' : req.status);
        setNotes('');
        setUpdateError('');
        setShowUpdateModal(true);
    };

    const handleUpdateStatus = async (e) => {
        e.preventDefault();
        setUpdateError('');
        setUpdateLoading(true);

        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${API_URL}/requests/${selectedRequest.id}/status`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ status: newStatus, notes })
            });

            const data = await res.json();
            if (res.ok) {
                setShowUpdateModal(false);
                fetchRequests();
                if (showDetailModal && selectedRequest.id) {
                    handleViewDetails(selectedRequest.id);
                }
                showToast('Status updated successfully!');
            } else {
                setUpdateError(data.error || 'Failed to update status');
                showToast(data.error || 'Failed to update status', 'error');
            }
        } catch (err) {
            setUpdateError('Failed to connect to server. Please try again.');
        } finally {
            setUpdateLoading(false);
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
            <div style={{ marginBottom: '2rem' }}>
                <h1 style={{ fontSize: '2rem', marginBottom: '0.25rem' }}>Assigned Maintenance Jobs</h1>
                <p style={{ color: 'var(--text-secondary)' }}>View and update progress on your assigned maintenance requests</p>
            </div>

            {/* Filters and Search */}
            <div className="glass-card" style={{ padding: '1.25rem', marginBottom: '2rem', display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center' }}>
                <div style={{ flex: 1, minWidth: '250px', position: 'relative' }}>
                    <Search size={18} color="var(--text-muted)" style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)' }} />
                    <input
                        type="text"
                        className="form-input"
                        placeholder="Search jobs..."
                        value={search}
                        onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                        style={{ paddingLeft: '2.75rem' }}
                    />
                </div>
                <div style={{ minWidth: '180px' }}>
                    <select
                        className="form-select"
                        value={statusFilter}
                        onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
                    >
                        <option value="">All Statuses</option>
                        <option value="assigned">Assigned</option>
                        <option value="in_progress">In Progress</option>
                        <option value="completed">Completed</option>
                        <option value="rejected">Rejected</option>
                    </select>
                </div>
            </div>

            {/* Jobs Grid */}
            {loading ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>Loading jobs...</div>
            ) : requests.length === 0 ? (
                <div className="glass-card" style={{ textAlign: 'center', padding: '4rem 2rem', color: 'var(--text-secondary)' }}>
                    <CheckCircle2 size={48} color="var(--success)" style={{ marginBottom: '1rem' }} />
                    <h3>No assigned jobs</h3>
                    <p style={{ marginTop: '0.5rem' }}>You have no active maintenance tasks assigned to you.</p>
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
                                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                                            <button className="btn btn-secondary" style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }} onClick={() => handleViewDetails(req.id)}>
                                                <Eye size={14} />
                                                Details
                                            </button>
                                            {(req.status === 'assigned' || req.status === 'in_progress') && (
                                                <button className="btn btn-primary" style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }} onClick={() => handleOpenUpdateModal(req)}>
                                                    <Edit3 size={14} />
                                                    Update
                                                </button>
                                            )}
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

                        {(selectedRequest.status === 'assigned' || selectedRequest.status === 'in_progress') && (
                            <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => handleOpenUpdateModal(selectedRequest)}>
                                <Edit3 size={16} />
                                Update Job Status
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* Update Status Modal */}
            {showUpdateModal && selectedRequest && (
                <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowUpdateModal(false)}>
                    <div className="modal-content" style={{ maxWidth: '450px' }}>
                        <h2 style={{ marginBottom: '1.5rem' }}>Update Job Status</h2>
                        {updateError && (
                            <div style={{ backgroundColor: 'var(--danger-bg)', border: '1px solid var(--danger-border)', color: 'var(--danger)', padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
                                {updateError}
                            </div>
                        )}
                        <form onSubmit={handleUpdateStatus}>
                            <div className="form-group">
                                <label className="form-label">New Status</label>
                                <select
                                    className="form-select"
                                    value={newStatus}
                                    onChange={(e) => setNewStatus(e.target.value)}
                                    required
                                >
                                    <option value="in_progress">In Progress</option>
                                    <option value="completed">Completed</option>
                                    <option value="rejected">Rejected / Cannot Fix</option>
                                </select>
                            </div>
                            <div className="form-group">
                                <label className="form-label">Work Log Notes</label>
                                <textarea
                                    className="form-textarea"
                                    placeholder="Describe the action taken or reason for status update..."
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    required
                                />
                            </div>
                            <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
                                <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowUpdateModal(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={updateLoading}>
                                    {updateLoading ? 'Updating...' : 'Update Status'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
