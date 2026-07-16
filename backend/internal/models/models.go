package models

import "time"

type User struct {
	ID           int       `json:"id"`
	Name         string    `json:"name"`
	Email        string    `json:"email"`
	PasswordHash string    `json:"-"`
	Role         string    `json:"role"` // student, staff, officer, admin
	CreatedAt    time.Time `json:"created_at"`
}

type Category struct {
	ID          int    `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
}

type Request struct {
	ID          int       `json:"id"`
	Title       string    `json:"title"`
	Description string    `json:"description"`
	CategoryID  *int      `json:"category_id"`
	Category    *Category `json:"category,omitempty"`
	ReporterID  int       `json:"reporter_id"`
	Reporter    *User     `json:"reporter,omitempty"`
	Status      string    `json:"status"`   // pending, assigned, in_progress, completed, rejected
	Priority    string    `json:"priority"` // low, medium, high
	Location    string    `json:"location"`
	ImageURL    *string   `json:"image_url"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
	OfficerID   *int      `json:"officer_id,omitempty"`
	OfficerName *string   `json:"officer_name,omitempty"`
}

type Assignment struct {
	ID          int        `json:"id"`
	RequestID   int        `json:"request_id"`
	OfficerID   int        `json:"officer_id"`
	AssignedBy  int        `json:"assigned_by"`
	AssignedAt  time.Time  `json:"assigned_at"`
	CompletedAt *time.Time `json:"completed_at"`
}

type StatusLog struct {
	ID            int       `json:"id"`
	RequestID     int       `json:"request_id"`
	Status        string    `json:"status"`
	UpdatedBy     int       `json:"updated_by"`
	UpdatedByName string    `json:"updated_by_name,omitempty"`
	Notes         string    `json:"notes"`
	CreatedAt     time.Time `json:"created_at"`
}

type Notification struct {
	ID        int       `json:"id"`
	UserID    int       `json:"user_id"`
	Message   string    `json:"message"`
	Read      bool      `json:"read"`
	CreatedAt time.Time `json:"created_at"`
}

type ActivityLog struct {
	ID        int       `json:"id"`
	UserID    *int      `json:"user_id"`
	UserName  *string   `json:"user_name,omitempty"`
	Action    string    `json:"action"`
	Details   string    `json:"details"`
	CreatedAt time.Time `json:"created_at"`
}
