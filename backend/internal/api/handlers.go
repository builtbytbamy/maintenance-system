package api

import (
	"database/sql"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"backend/internal/database"
	"backend/internal/models"

	"github.com/go-chi/chi/v5"
	"github.com/golang-jwt/jwt/v5"
	"github.com/jung-kurt/gofpdf"
	"golang.org/x/crypto/bcrypt"
)

type Handler struct {
	DB  *database.DB
	Hub *Hub
}

func NewHandler(db *database.DB, hub *Hub) *Handler {
	return &Handler{DB: db, Hub: hub}
}

// JSON response helpers
func respondWithError(w http.ResponseWriter, code int, message string) {
	respondWithJSON(w, code, map[string]string{"error": message})
}

func respondWithJSON(w http.ResponseWriter, code int, payload interface{}) {
	response, err := json.Marshal(payload)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte(`{"error": "Internal Server Error"}`))
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	w.Write(response)
}

func (h *Handler) createNotification(userID int, message string) {
	_, err := h.DB.Exec(`
		INSERT INTO notifications (user_id, message)
		VALUES ($1, $2)
	`, userID, message)
	if err != nil {
		fmt.Printf("Failed to create notification: %v\n", err)
		return
	}

	// Broadcast notification via WebSocket
	h.Hub.BroadcastToUser(userID, map[string]interface{}{
		"type":    "notification",
		"message": message,
	})
}

func (h *Handler) logActivity(userID *int, action string, details string) {
	_, err := h.DB.Exec(`
		INSERT INTO activity_logs (user_id, action, details)
		VALUES ($1, $2, $3)
	`, userID, action, details)
	if err != nil {
		fmt.Printf("Failed to log activity: %v\n", err)
	}
}

// --- AUTH HANDLERS ---

type RegisterRequest struct {
	Name     string `json:"name"`
	Email    string `json:"email"`
	Password string `json:"password"`
	Role     string `json:"role"` // student, staff, officer, admin
}

func (h *Handler) Register(w http.ResponseWriter, r *http.Request) {
	var req RegisterRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondWithError(w, http.StatusBadRequest, "Invalid request payload")
		return
	}

	req.Name = strings.TrimSpace(req.Name)
	req.Email = strings.TrimSpace(strings.ToLower(req.Email))
	req.Password = strings.TrimSpace(req.Password)
	req.Role = strings.TrimSpace(strings.ToLower(req.Role))

	if req.Name == "" || req.Email == "" || req.Password == "" || req.Role == "" {
		respondWithError(w, http.StatusBadRequest, "All fields are required")
		return
	}

	// Validate role
	if req.Role != "student" && req.Role != "staff" && req.Role != "officer" && req.Role != "admin" {
		respondWithError(w, http.StatusBadRequest, "Invalid role")
		return
	}

	// If registering as admin or officer, check if the current user is an admin
	if req.Role == "admin" || req.Role == "officer" {
		claims, err := GetUserFromContext(r.Context())
		// If no claims or not admin, reject
		if err != nil || claims.Role != "admin" {
			respondWithError(w, http.StatusForbidden, "Only administrators can register officers or admins")
			return
		}
	}

	// Hash password
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		respondWithError(w, http.StatusInternalServerError, "Failed to hash password")
		return
	}

	var userID int
	err = h.DB.QueryRow(`
		INSERT INTO users (name, email, password_hash, role)
		VALUES ($1, $2, $3, $4)
		RETURNING id
	`, req.Name, req.Email, string(hashedPassword), req.Role).Scan(&userID)

	if err != nil {
		if strings.Contains(err.Error(), "unique constraint") || strings.Contains(err.Error(), "duplicate key") {
			respondWithError(w, http.StatusConflict, "Email already registered")
			return
		}
		respondWithError(w, http.StatusInternalServerError, fmt.Sprintf("Failed to register user: %v", err))
		return
	}

	h.logActivity(&userID, "USER_REGISTERED", fmt.Sprintf("User %s registered with role %s", req.Email, req.Role))

	respondWithJSON(w, http.StatusCreated, map[string]interface{}{
		"message": "User registered successfully",
		"user_id": userID,
	})
}

type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

func (h *Handler) Login(w http.ResponseWriter, r *http.Request) {
	var req LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondWithError(w, http.StatusBadRequest, "Invalid request payload")
		return
	}

	req.Email = strings.TrimSpace(strings.ToLower(req.Email))
	req.Password = strings.TrimSpace(req.Password)

	if req.Email == "" || req.Password == "" {
		respondWithError(w, http.StatusBadRequest, "Email and password are required")
		return
	}

	var user models.User
	err := h.DB.QueryRow(`
		SELECT id, name, email, password_hash, role, created_at
		FROM users
		WHERE email = $1
	`, req.Email).Scan(&user.ID, &user.Name, &user.Email, &user.PasswordHash, &user.Role, &user.CreatedAt)

	if err == sql.ErrNoRows {
		respondWithError(w, http.StatusUnauthorized, "Invalid email or password")
		return
	} else if err != nil {
		respondWithError(w, http.StatusInternalServerError, "Database error")
		return
	}

	err = bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password))
	if err != nil {
		respondWithError(w, http.StatusUnauthorized, "Invalid email or password")
		return
	}

	// Generate JWT
	expirationTime := time.Now().Add(24 * time.Hour)
	claims := &Claims{
		UserID: user.ID,
		Email:  user.Email,
		Role:   user.Role,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(expirationTime),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString(JwtSecret)
	if err != nil {
		respondWithError(w, http.StatusInternalServerError, "Failed to generate token")
		return
	}

	h.logActivity(&user.ID, "USER_LOGIN", fmt.Sprintf("User %s logged in", user.Email))

	respondWithJSON(w, http.StatusOK, map[string]interface{}{
		"token": tokenString,
		"user": map[string]interface{}{
			"id":    user.ID,
			"name":  user.Name,
			"email": user.Email,
			"role":  user.Role,
		},
	})
}

func (h *Handler) GetProfile(w http.ResponseWriter, r *http.Request) {
	claims, err := GetUserFromContext(r.Context())
	if err != nil {
		respondWithError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	var user models.User
	err = h.DB.QueryRow(`
		SELECT id, name, email, role, created_at
		FROM users
		WHERE id = $1
	`, claims.UserID).Scan(&user.ID, &user.Name, &user.Email, &user.Role, &user.CreatedAt)

	if err != nil {
		respondWithError(w, http.StatusInternalServerError, "Failed to fetch profile")
		return
	}

	respondWithJSON(w, http.StatusOK, user)
}

// --- REQUEST HANDLERS ---

func (h *Handler) CreateRequest(w http.ResponseWriter, r *http.Request) {
	claims, err := GetUserFromContext(r.Context())
	if err != nil {
		respondWithError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	// Parse multipart form
	err = r.ParseMultipartForm(10 << 20) // 10MB max
	if err != nil {
		respondWithError(w, http.StatusBadRequest, "Failed to parse form data")
		return
	}

	title := r.FormValue("title")
	description := r.FormValue("description")
	categoryIDStr := r.FormValue("category_id")
	priority := r.FormValue("priority")
	location := r.FormValue("location")

	if title == "" || description == "" || categoryIDStr == "" || location == "" {
		respondWithError(w, http.StatusBadRequest, "Title, description, category_id, and location are required")
		return
	}

	categoryID, err := strconv.Atoi(categoryIDStr)
	if err != nil {
		respondWithError(w, http.StatusBadRequest, "Invalid category_id")
		return
	}

	if priority == "" {
		priority = "medium"
	}

	// Handle file upload
	var imageURL *string
	file, header, err := r.FormFile("image")
	if err == nil {
		defer file.Close()

		// Create uploads directory if it doesn't exist
		uploadsDir := "./uploads"
		if err := os.MkdirAll(uploadsDir, os.ModePerm); err != nil {
			respondWithError(w, http.StatusInternalServerError, "Failed to create uploads directory")
			return
		}

		// Generate unique filename
		filename := fmt.Sprintf("%d-%s", time.Now().UnixNano(), filepath.Base(header.Filename))
		filePath := filepath.Join(uploadsDir, filename)

		out, err := os.Create(filePath)
		if err != nil {
			respondWithError(w, http.StatusInternalServerError, "Failed to save file")
			return
		}
		defer out.Close()

		_, err = io.Copy(out, file)
		if err != nil {
			respondWithError(w, http.StatusInternalServerError, "Failed to write file")
			return
		}

		url := fmt.Sprintf("/uploads/%s", filename)
		imageURL = &url
	}

	var requestID int
	err = h.DB.QueryRow(`
		INSERT INTO requests (title, description, category_id, reporter_id, status, priority, location, image_url)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		RETURNING id
	`, title, description, categoryID, claims.UserID, "pending", priority, location, imageURL).Scan(&requestID)

	if err != nil {
		respondWithError(w, http.StatusInternalServerError, fmt.Sprintf("Failed to create request: %v", err))
		return
	}

	// Log status change
	_, err = h.DB.Exec(`
		INSERT INTO status_logs (request_id, status, updated_by, notes)
		VALUES ($1, $2, $3, $4)
	`, requestID, "pending", claims.UserID, "Request submitted successfully")
	if err != nil {
		log := fmt.Sprintf("Failed to log status for request %d: %v", requestID, err)
		fmt.Println(log)
	}

	h.logActivity(&claims.UserID, "REQUEST_CREATED", fmt.Sprintf("Request %d created: %s", requestID, title))

	// Notify all admins
	adminRows, err := h.DB.Query("SELECT id FROM users WHERE role = 'admin'")
	if err == nil {
		defer adminRows.Close()
		for adminRows.Next() {
			var adminID int
			if err := adminRows.Scan(&adminID); err == nil {
				h.createNotification(adminID, fmt.Sprintf("New request submitted: %s", title))
			}
		}
	}

	// Broadcast to all admins
	h.Hub.BroadcastToRole("admin", map[string]interface{}{
		"type": "request_created",
		"request": map[string]interface{}{
			"id":       requestID,
			"title":    title,
			"location": location,
			"status":   "pending",
		},
	})

	respondWithJSON(w, http.StatusCreated, map[string]interface{}{
		"message":    "Request submitted successfully",
		"request_id": requestID,
	})
}

func (h *Handler) GetRequests(w http.ResponseWriter, r *http.Request) {
	claims, err := GetUserFromContext(r.Context())
	if err != nil {
		respondWithError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	// Query params
	statusQuery := r.URL.Query().Get("status")
	priorityQuery := r.URL.Query().Get("priority")
	categoryQuery := r.URL.Query().Get("category_id")
	searchQuery := r.URL.Query().Get("search")
	pageQuery := r.URL.Query().Get("page")
	limitQuery := r.URL.Query().Get("limit")

	page := 1
	limit := 10
	if pageQuery != "" {
		if p, err := strconv.Atoi(pageQuery); err == nil && p > 0 {
			page = p
		}
	}
	if limitQuery != "" {
		if l, err := strconv.Atoi(limitQuery); err == nil && l > 0 {
			limit = l
		}
	}
	offset := (page - 1) * limit

	// Build SQL query dynamically
	filterQuery := ""
	args := []interface{}{}
	argCount := 1

	// Role-based filtering
	if claims.Role == "student" || claims.Role == "staff" {
		filterQuery += fmt.Sprintf(" AND r.reporter_id = $%d", argCount)
		args = append(args, claims.UserID)
		argCount++
	} else if claims.Role == "officer" {
		filterQuery += fmt.Sprintf(" AND a.officer_id = $%d", argCount)
		args = append(args, claims.UserID)
		argCount++
	}

	// Filter by status
	if statusQuery != "" {
		filterQuery += fmt.Sprintf(" AND r.status = $%d", argCount)
		args = append(args, statusQuery)
		argCount++
	}

	// Filter by priority
	if priorityQuery != "" {
		filterQuery += fmt.Sprintf(" AND r.priority = $%d", argCount)
		args = append(args, priorityQuery)
		argCount++
	}

	// Filter by category
	if categoryQuery != "" {
		catID, err := strconv.Atoi(categoryQuery)
		if err == nil {
			filterQuery += fmt.Sprintf(" AND r.category_id = $%d", argCount)
			args = append(args, catID)
			argCount++
		}
	}

	// Search query
	if searchQuery != "" {
		filterQuery += fmt.Sprintf(" AND (r.title ILIKE $%d OR r.description ILIKE $%d OR r.location ILIKE $%d)", argCount, argCount, argCount)
		args = append(args, "%"+searchQuery+"%")
		argCount++
	}

	// Get total count for pagination
	countQuery := `
		SELECT COUNT(*)
		FROM requests r
		LEFT JOIN categories c ON r.category_id = c.id
		LEFT JOIN users u ON r.reporter_id = u.id
		LEFT JOIN assignments a ON r.id = a.request_id AND a.id = (
			SELECT a2.id FROM assignments a2 WHERE a2.request_id = r.id ORDER BY a2.assigned_at DESC LIMIT 1
		)
		LEFT JOIN users o ON a.officer_id = o.id
		WHERE 1=1
	` + filterQuery

	var totalCount int
	err = h.DB.QueryRow(countQuery, args...).Scan(&totalCount)
	if err != nil {
		respondWithError(w, http.StatusInternalServerError, fmt.Sprintf("Failed to count requests: %v", err))
		return
	}

	// Main query
	query := `
		SELECT r.id, r.title, r.description, r.category_id, c.name as category_name,
		       r.reporter_id, u.name as reporter_name, r.status, r.priority, r.location,
		       r.image_url, r.created_at, r.updated_at,
		       a.officer_id, o.name as officer_name
		FROM requests r
		LEFT JOIN categories c ON r.category_id = c.id
		LEFT JOIN users u ON r.reporter_id = u.id
		LEFT JOIN assignments a ON r.id = a.request_id AND a.id = (
			SELECT a2.id FROM assignments a2 WHERE a2.request_id = r.id ORDER BY a2.assigned_at DESC LIMIT 1
		)
		LEFT JOIN users o ON a.officer_id = o.id
		WHERE 1=1
	` + filterQuery

	// Order and pagination
	query += fmt.Sprintf(" ORDER BY r.created_at DESC LIMIT $%d OFFSET $%d", argCount, argCount+1)
	args = append(args, limit, offset)

	rows, err := h.DB.Query(query, args...)
	if err != nil {
		respondWithError(w, http.StatusInternalServerError, fmt.Sprintf("Failed to query requests: %v", err))
		return
	}
	defer rows.Close()

	requests := []models.Request{}
	for rows.Next() {
		var req models.Request
		var catName sql.NullString
		var reporterName sql.NullString
		var officerID sql.NullInt64
		var officerName sql.NullString

		err := rows.Scan(
			&req.ID, &req.Title, &req.Description, &req.CategoryID, &catName,
			&req.ReporterID, &reporterName, &req.Status, &req.Priority, &req.Location,
			&req.ImageURL, &req.CreatedAt, &req.UpdatedAt,
			&officerID, &officerName,
		)
		if err != nil {
			respondWithError(w, http.StatusInternalServerError, fmt.Sprintf("Failed to scan request: %v", err))
			return
		}

		if catName.Valid {
			req.Category = &models.Category{ID: *req.CategoryID, Name: catName.String}
		}
		if reporterName.Valid {
			req.Reporter = &models.User{ID: req.ReporterID, Name: reporterName.String}
		}
		if officerID.Valid {
			id := int(officerID.Int64)
			req.OfficerID = &id
		}
		if officerName.Valid {
			req.OfficerName = &officerName.String
		}

		requests = append(requests, req)
	}

	respondWithJSON(w, http.StatusOK, map[string]interface{}{
		"requests": requests,
		"pagination": map[string]interface{}{
			"total": totalCount,
			"page":  page,
			"limit": limit,
			"pages": (totalCount + limit - 1) / limit,
		},
	})
}

func (h *Handler) GetRequestByID(w http.ResponseWriter, r *http.Request) {
	claims, err := GetUserFromContext(r.Context())
	if err != nil {
		respondWithError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	idStr := chi.URLParam(r, "id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		respondWithError(w, http.StatusBadRequest, "Invalid request ID")
		return
	}

	// Fetch request
	var req models.Request
	var catName sql.NullString
	var reporterName sql.NullString
	var officerID sql.NullInt64
	var officerName sql.NullString

	err = h.DB.QueryRow(`
		SELECT r.id, r.title, r.description, r.category_id, c.name as category_name,
		       r.reporter_id, u.name as reporter_name, r.status, r.priority, r.location,
		       r.image_url, r.created_at, r.updated_at,
		       a.officer_id, o.name as officer_name
		FROM requests r
		LEFT JOIN categories c ON r.category_id = c.id
		LEFT JOIN users u ON r.reporter_id = u.id
		LEFT JOIN assignments a ON r.id = a.request_id AND a.id = (
			SELECT a2.id FROM assignments a2 WHERE a2.request_id = r.id ORDER BY a2.assigned_at DESC LIMIT 1
		)
		LEFT JOIN users o ON a.officer_id = o.id
		WHERE r.id = $1
	`, id).Scan(
		&req.ID, &req.Title, &req.Description, &req.CategoryID, &catName,
		&req.ReporterID, &reporterName, &req.Status, &req.Priority, &req.Location,
		&req.ImageURL, &req.CreatedAt, &req.UpdatedAt,
		&officerID, &officerName,
	)

	if err == sql.ErrNoRows {
		respondWithError(w, http.StatusNotFound, "Request not found")
		return
	} else if err != nil {
		respondWithError(w, http.StatusInternalServerError, fmt.Sprintf("Database error: %v", err))
		return
	}

	// Check authorization
	if claims.Role == "student" || claims.Role == "staff" {
		if req.ReporterID != claims.UserID {
			respondWithError(w, http.StatusForbidden, "Forbidden: you do not own this request")
			return
		}
	} else if claims.Role == "officer" {
		var exists bool
		err := h.DB.QueryRow("SELECT EXISTS(SELECT 1 FROM assignments WHERE request_id = $1 AND officer_id = $2)", id, claims.UserID).Scan(&exists)
		if err != nil || !exists {
			respondWithError(w, http.StatusForbidden, "Forbidden: this request is not assigned to you")
			return
		}
	}

	if catName.Valid {
		req.Category = &models.Category{ID: *req.CategoryID, Name: catName.String}
	}
	if reporterName.Valid {
		req.Reporter = &models.User{ID: req.ReporterID, Name: reporterName.String}
	}
	if officerID.Valid {
		id := int(officerID.Int64)
		req.OfficerID = &id
	}
	if officerName.Valid {
		req.OfficerName = &officerName.String
	}

	// Fetch status logs
	rows, err := h.DB.Query(`
		SELECT l.id, l.request_id, l.status, l.updated_by, u.name as updated_by_name, l.notes, l.created_at
		FROM status_logs l
		LEFT JOIN users u ON l.updated_by = u.id
		WHERE l.request_id = $1
		ORDER BY l.created_at DESC
	`, id)
	if err != nil {
		respondWithError(w, http.StatusInternalServerError, "Failed to fetch status logs")
		return
	}
	defer rows.Close()

	logs := []models.StatusLog{}
	for rows.Next() {
		var log models.StatusLog
		var updatedByName sql.NullString
		err := rows.Scan(&log.ID, &log.RequestID, &log.Status, &log.UpdatedBy, &updatedByName, &log.Notes, &log.CreatedAt)
		if err != nil {
			respondWithError(w, http.StatusInternalServerError, "Failed to scan status log")
			return
		}
		if updatedByName.Valid {
			log.UpdatedByName = updatedByName.String
		}
		logs = append(logs, log)
	}

	respondWithJSON(w, http.StatusOK, map[string]interface{}{
		"request": req,
		"logs":    logs,
	})
}

func (h *Handler) UpdateRequest(w http.ResponseWriter, r *http.Request) {
	claims, err := GetUserFromContext(r.Context())
	if err != nil {
		respondWithError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	idStr := chi.URLParam(r, "id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		respondWithError(w, http.StatusBadRequest, "Invalid request ID")
		return
	}

	// Fetch request to check owner and status
	var reporterID int
	var status string
	err = h.DB.QueryRow("SELECT reporter_id, status FROM requests WHERE id = $1", id).Scan(&reporterID, &status)
	if err == sql.ErrNoRows {
		respondWithError(w, http.StatusNotFound, "Request not found")
		return
	} else if err != nil {
		respondWithError(w, http.StatusInternalServerError, "Database error")
		return
	}

	// Only reporter can update, and only if status is pending
	if reporterID != claims.UserID {
		respondWithError(w, http.StatusForbidden, "Forbidden: you do not own this request")
		return
	}

	if status != "pending" {
		respondWithError(w, http.StatusBadRequest, "Only pending requests can be updated")
		return
	}

	// Parse body
	var req struct {
		Title       string `json:"title"`
		Description string `json:"description"`
		CategoryID  int    `json:"category_id"`
		Priority    string `json:"priority"`
		Location    string `json:"location"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondWithError(w, http.StatusBadRequest, "Invalid request payload")
		return
	}

	if req.Title == "" || req.Description == "" || req.CategoryID == 0 || req.Location == "" {
		respondWithError(w, http.StatusBadRequest, "Title, description, category_id, and location are required")
		return
	}

	_, err = h.DB.Exec(`
		UPDATE requests
		SET title = $1, description = $2, category_id = $3, priority = $4, location = $5, updated_at = CURRENT_TIMESTAMP
		WHERE id = $6
	`, req.Title, req.Description, req.CategoryID, req.Priority, req.Location, id)

	if err != nil {
		respondWithError(w, http.StatusInternalServerError, "Failed to update request")
		return
	}

	respondWithJSON(w, http.StatusOK, map[string]string{"message": "Request updated successfully"})
}

func (h *Handler) DeleteRequest(w http.ResponseWriter, r *http.Request) {
	claims, err := GetUserFromContext(r.Context())
	if err != nil {
		respondWithError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	idStr := chi.URLParam(r, "id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		respondWithError(w, http.StatusBadRequest, "Invalid request ID")
		return
	}

	// Fetch request to check owner and status
	var reporterID int
	var status string
	err = h.DB.QueryRow("SELECT reporter_id, status FROM requests WHERE id = $1", id).Scan(&reporterID, &status)
	if err == sql.ErrNoRows {
		respondWithError(w, http.StatusNotFound, "Request not found")
		return
	} else if err != nil {
		respondWithError(w, http.StatusInternalServerError, "Database error")
		return
	}

	// Only reporter (if pending) or admin can delete
	if claims.Role != "admin" {
		if reporterID != claims.UserID {
			respondWithError(w, http.StatusForbidden, "Forbidden: you do not own this request")
			return
		}
		if status != "pending" {
			respondWithError(w, http.StatusBadRequest, "Only pending requests can be deleted")
			return
		}
	}

	_, err = h.DB.Exec("DELETE FROM requests WHERE id = $1", id)
	if err != nil {
		respondWithError(w, http.StatusInternalServerError, "Failed to delete request")
		return
	}

	respondWithJSON(w, http.StatusOK, map[string]string{"message": "Request deleted successfully"})
}

// --- ADMIN HANDLERS ---

type AssignPayload struct {
	OfficerID int `json:"officer_id"`
}

func (h *Handler) AssignRequest(w http.ResponseWriter, r *http.Request) {
	claims, err := GetUserFromContext(r.Context())
	if err != nil {
		respondWithError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	idStr := chi.URLParam(r, "id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		respondWithError(w, http.StatusBadRequest, "Invalid request ID")
		return
	}

	var payload AssignPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		respondWithError(w, http.StatusBadRequest, "Invalid request payload")
		return
	}

	// Verify officer exists and has officer role
	var officerRole string
	err = h.DB.QueryRow("SELECT role FROM users WHERE id = $1", payload.OfficerID).Scan(&officerRole)
	if err == sql.ErrNoRows || officerRole != "officer" {
		respondWithError(w, http.StatusBadRequest, "Invalid officer ID")
		return
	}

	// Check request status
	var currentStatus string
	var currentTitle string
	var reporterID int
	err = h.DB.QueryRow("SELECT status, title, reporter_id FROM requests WHERE id = $1", id).Scan(&currentStatus, &currentTitle, &reporterID)
	if err == sql.ErrNoRows {
		respondWithError(w, http.StatusNotFound, "Request not found")
		return
	}

	tx, err := h.DB.Begin()
	if err != nil {
		respondWithError(w, http.StatusInternalServerError, "Failed to start transaction")
		return
	}
	defer tx.Rollback()

	// Deactivate any active assignments
	_, err = tx.Exec(`
		UPDATE assignments
		SET completed_at = CURRENT_TIMESTAMP
		WHERE request_id = $1 AND completed_at IS NULL
	`, id)
	if err != nil {
		respondWithError(w, http.StatusInternalServerError, "Failed to update previous assignments")
		return
	}

	// Create new assignment
	_, err = tx.Exec(`
		INSERT INTO assignments (request_id, officer_id, assigned_by)
		VALUES ($1, $2, $3)
	`, id, payload.OfficerID, claims.UserID)
	if err != nil {
		respondWithError(w, http.StatusInternalServerError, "Failed to assign request")
		return
	}

	// Update request status to 'assigned'
	_, err = tx.Exec(`
		UPDATE requests
		SET status = 'assigned', updated_at = CURRENT_TIMESTAMP
		WHERE id = $1
	`, id)
	if err != nil {
		respondWithError(w, http.StatusInternalServerError, "Failed to update request status")
		return
	}

	// Log status change
	_, err = tx.Exec(`
		INSERT INTO status_logs (request_id, status, updated_by, notes)
		VALUES ($1, $2, $3, $4)
	`, id, "assigned", claims.UserID, fmt.Sprintf("Assigned to officer ID %d", payload.OfficerID))
	if err != nil {
		respondWithError(w, http.StatusInternalServerError, "Failed to log status change")
		return
	}

	if err := tx.Commit(); err != nil {
		respondWithError(w, http.StatusInternalServerError, "Failed to commit transaction")
		return
	}

	h.logActivity(&claims.UserID, "REQUEST_ASSIGNED", fmt.Sprintf("Request %d assigned to officer %d", id, payload.OfficerID))

	// Notify officer
	h.createNotification(payload.OfficerID, fmt.Sprintf("You have been assigned a new task: %s", currentTitle))

	// Notify reporter
	h.createNotification(reporterID, fmt.Sprintf("Your request '%s' has been assigned to a maintenance officer.", currentTitle))

	// Broadcast WebSocket message to the officer, reporter, and admins
	h.Hub.BroadcastToUser(payload.OfficerID, map[string]interface{}{
		"type":       "request_assigned",
		"request_id": id,
		"title":      currentTitle,
	})
	h.Hub.BroadcastToUser(reporterID, map[string]interface{}{
		"type":       "request_assigned",
		"request_id": id,
		"title":      currentTitle,
	})
	h.Hub.BroadcastToRole("admin", map[string]interface{}{
		"type":       "request_assigned",
		"request_id": id,
		"officer_id": payload.OfficerID,
	})

	respondWithJSON(w, http.StatusOK, map[string]string{"message": "Request assigned successfully"})
}

func (h *Handler) GetUsers(w http.ResponseWriter, r *http.Request) {
	roleQuery := r.URL.Query().Get("role")

	query := "SELECT id, name, email, role, created_at FROM users"
	args := []interface{}{}
	if roleQuery != "" {
		query += " WHERE role = $1"
		args = append(args, roleQuery)
	}
	query += " ORDER BY name ASC"

	rows, err := h.DB.Query(query, args...)
	if err != nil {
		respondWithError(w, http.StatusInternalServerError, "Failed to query users")
		return
	}
	defer rows.Close()

	users := []models.User{}
	for rows.Next() {
		var u models.User
		err := rows.Scan(&u.ID, &u.Name, &u.Email, &u.Role, &u.CreatedAt)
		if err != nil {
			respondWithError(w, http.StatusInternalServerError, "Failed to scan user")
			return
		}
		users = append(users, u)
	}

	respondWithJSON(w, http.StatusOK, users)
}

func (h *Handler) ExportRequestsCSV(w http.ResponseWriter, r *http.Request) {
	statusQuery := r.URL.Query().Get("status")
	categoryQuery := r.URL.Query().Get("category_id")
	searchQuery := r.URL.Query().Get("search")

	query := `
		SELECT r.id, r.title, r.description, c.name as category_name,
		       u.name as reporter_name, r.status, r.priority, r.location,
		       r.created_at, o.name as officer_name
		FROM requests r
		LEFT JOIN categories c ON r.category_id = c.id
		LEFT JOIN users u ON r.reporter_id = u.id
		LEFT JOIN assignments a ON r.id = a.request_id AND a.id = (
			SELECT a2.id FROM assignments a2 WHERE a2.request_id = r.id ORDER BY a2.assigned_at DESC LIMIT 1
		)
		LEFT JOIN users o ON a.officer_id = o.id
		WHERE 1=1
	`
	args := []interface{}{}
	argCount := 1

	if statusQuery != "" {
		query += fmt.Sprintf(" AND r.status = $%d", argCount)
		args = append(args, statusQuery)
		argCount++
	}

	if categoryQuery != "" {
		catID, err := strconv.Atoi(categoryQuery)
		if err == nil {
			query += fmt.Sprintf(" AND r.category_id = $%d", argCount)
			args = append(args, catID)
			argCount++
		}
	}

	if searchQuery != "" {
		query += fmt.Sprintf(" AND (r.title ILIKE $%d OR r.description ILIKE $%d OR r.location ILIKE $%d)", argCount, argCount, argCount)
		args = append(args, "%"+searchQuery+"%")
		argCount++
	}

	query += " ORDER BY r.created_at DESC"

	rows, err := h.DB.Query(query, args...)
	if err != nil {
		respondWithError(w, http.StatusInternalServerError, "Failed to fetch data for export")
		return
	}
	defer rows.Close()

	w.Header().Set("Content-Type", "text/csv")
	w.Header().Set("Content-Disposition", "attachment;filename=maintenance_requests_report.csv")

	writer := csv.NewWriter(w)
	defer writer.Flush()

	// Write header
	err = writer.Write([]string{"Request ID", "Title", "Description", "Category", "Reporter", "Status", "Priority", "Location", "Created At", "Assigned Officer"})
	if err != nil {
		respondWithError(w, http.StatusInternalServerError, "Failed to write CSV header")
		return
	}

	for rows.Next() {
		var id int
		var title, description, categoryName, reporterName, status, priority, location, createdAt string
		var officerName sql.NullString

		err := rows.Scan(&id, &title, &description, &categoryName, &reporterName, &status, &priority, &location, &createdAt, &officerName)
		if err != nil {
			respondWithError(w, http.StatusInternalServerError, "Failed to scan CSV row")
			return
		}

		assignedOfficer := "Unassigned"
		if officerName.Valid {
			assignedOfficer = officerName.String
		}

		err = writer.Write([]string{
			strconv.Itoa(id),
			title,
			description,
			categoryName,
			reporterName,
			status,
			priority,
			location,
			createdAt,
			assignedOfficer,
		})
		if err != nil {
			respondWithError(w, http.StatusInternalServerError, "Failed to write CSV row")
			return
		}
	}
}

// --- OFFICER HANDLERS ---

type UpdateStatusPayload struct {
	Status string `json:"status"` // in_progress, completed, rejected
	Notes  string `json:"notes"`
}

func (h *Handler) UpdateStatus(w http.ResponseWriter, r *http.Request) {
	claims, err := GetUserFromContext(r.Context())
	if err != nil {
		respondWithError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	idStr := chi.URLParam(r, "id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		respondWithError(w, http.StatusBadRequest, "Invalid request ID")
		return
	}

	var payload UpdateStatusPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		respondWithError(w, http.StatusBadRequest, "Invalid request payload")
		return
	}

	payload.Status = strings.TrimSpace(strings.ToLower(payload.Status))
	payload.Notes = strings.TrimSpace(payload.Notes)

	if payload.Status != "in_progress" && payload.Status != "completed" && payload.Status != "rejected" {
		respondWithError(w, http.StatusBadRequest, "Invalid status. Must be in_progress, completed, or rejected")
		return
	}

	// Verify request is assigned to this officer
	var officerID int
	var currentTitle string
	var reporterID int
	err = h.DB.QueryRow(`
		SELECT a.officer_id, r.title, r.reporter_id
		FROM assignments a
		JOIN requests r ON a.request_id = r.id
		WHERE a.request_id = $1 AND a.completed_at IS NULL
	`, id).Scan(&officerID, &currentTitle, &reporterID)

	if err == sql.ErrNoRows || officerID != claims.UserID {
		respondWithError(w, http.StatusForbidden, "Forbidden: this request is not assigned to you")
		return
	}

	tx, err := h.DB.Begin()
	if err != nil {
		respondWithError(w, http.StatusInternalServerError, "Failed to start transaction")
		return
	}
	defer tx.Rollback()

	// Update request status
	_, err = tx.Exec(`
		UPDATE requests
		SET status = $1, updated_at = CURRENT_TIMESTAMP
		WHERE id = $2
	`, payload.Status, id)
	if err != nil {
		respondWithError(w, http.StatusInternalServerError, "Failed to update request status")
		return
	}

	// If completed or rejected, mark assignment as completed
	if payload.Status == "completed" || payload.Status == "rejected" {
		_, err = tx.Exec(`
			UPDATE assignments
			SET completed_at = CURRENT_TIMESTAMP
			WHERE request_id = $1 AND completed_at IS NULL
		`, id)
		if err != nil {
			respondWithError(w, http.StatusInternalServerError, "Failed to complete assignment")
			return
		}
	}

	// Log status change
	_, err = tx.Exec(`
		INSERT INTO status_logs (request_id, status, updated_by, notes)
		VALUES ($1, $2, $3, $4)
	`, id, payload.Status, claims.UserID, payload.Notes)
	if err != nil {
		respondWithError(w, http.StatusInternalServerError, "Failed to log status change")
		return
	}

	if err := tx.Commit(); err != nil {
		respondWithError(w, http.StatusInternalServerError, "Failed to commit transaction")
		return
	}

	h.logActivity(&claims.UserID, "STATUS_UPDATED", fmt.Sprintf("Request %d status updated to %s", id, payload.Status))

	// Notify reporter
	h.createNotification(reporterID, fmt.Sprintf("Your request '%s' status has been updated to %s: %s", currentTitle, payload.Status, payload.Notes))

	// Notify all admins
	adminRows, err := h.DB.Query("SELECT id FROM users WHERE role = 'admin'")
	if err == nil {
		defer adminRows.Close()
		for adminRows.Next() {
			var adminID int
			if err := adminRows.Scan(&adminID); err == nil {
				h.createNotification(adminID, fmt.Sprintf("Request %d status updated to %s by officer", id, payload.Status))
			}
		}
	}

	// Broadcast WebSocket message to the officer, reporter, and admins
	h.Hub.BroadcastToUser(officerID, map[string]interface{}{
		"type":       "status_updated",
		"request_id": id,
		"status":     payload.Status,
	})
	h.Hub.BroadcastToUser(reporterID, map[string]interface{}{
		"type":       "status_updated",
		"request_id": id,
		"status":     payload.Status,
	})
	h.Hub.BroadcastToRole("admin", map[string]interface{}{
		"type":       "status_updated",
		"request_id": id,
		"status":     payload.Status,
	})

	respondWithJSON(w, http.StatusOK, map[string]string{"message": "Status updated successfully"})
}

// --- CATEGORIES HANDLER ---

func (h *Handler) GetCategories(w http.ResponseWriter, r *http.Request) {
	rows, err := h.DB.Query("SELECT id, name, description FROM categories ORDER BY name ASC")
	if err != nil {
		respondWithError(w, http.StatusInternalServerError, "Failed to query categories")
		return
	}
	defer rows.Close()

	categories := []models.Category{}
	for rows.Next() {
		var c models.Category
		err := rows.Scan(&c.ID, &c.Name, &c.Description)
		if err != nil {
			respondWithError(w, http.StatusInternalServerError, "Failed to scan category")
			return
		}
		categories = append(categories, c)
	}

	respondWithJSON(w, http.StatusOK, categories)
}

// --- NOTIFICATION HANDLERS ---

func (h *Handler) GetNotifications(w http.ResponseWriter, r *http.Request) {
	claims, err := GetUserFromContext(r.Context())
	if err != nil {
		respondWithError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	rows, err := h.DB.Query(`
		SELECT id, user_id, message, read, created_at
		FROM notifications
		WHERE user_id = $1
		ORDER BY created_at DESC
		LIMIT 50
	`, claims.UserID)
	if err != nil {
		respondWithError(w, http.StatusInternalServerError, "Failed to query notifications")
		return
	}
	defer rows.Close()

	notifications := []models.Notification{}
	for rows.Next() {
		var n models.Notification
		err := rows.Scan(&n.ID, &n.UserID, &n.Message, &n.Read, &n.CreatedAt)
		if err != nil {
			respondWithError(w, http.StatusInternalServerError, "Failed to scan notification")
			return
		}
		notifications = append(notifications, n)
	}

	respondWithJSON(w, http.StatusOK, notifications)
}

func (h *Handler) MarkNotificationRead(w http.ResponseWriter, r *http.Request) {
	claims, err := GetUserFromContext(r.Context())
	if err != nil {
		respondWithError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	idStr := chi.URLParam(r, "id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		respondWithError(w, http.StatusBadRequest, "Invalid notification ID")
		return
	}

	_, err = h.DB.Exec(`
		UPDATE notifications
		SET read = TRUE
		WHERE id = $1 AND user_id = $2
	`, id, claims.UserID)
	if err != nil {
		respondWithError(w, http.StatusInternalServerError, "Failed to update notification")
		return
	}

	respondWithJSON(w, http.StatusOK, map[string]string{"message": "Notification marked as read"})
}

// --- AUDIT LOG HANDLERS ---

func (h *Handler) GetActivityLogs(w http.ResponseWriter, r *http.Request) {
	rows, err := h.DB.Query(`
		SELECT l.id, l.user_id, u.name as user_name, l.action, l.details, l.created_at
		FROM activity_logs l
		LEFT JOIN users u ON l.user_id = u.id
		ORDER BY l.created_at DESC
		LIMIT 100
	`)
	if err != nil {
		respondWithError(w, http.StatusInternalServerError, "Failed to query activity logs")
		return
	}
	defer rows.Close()

	logs := []models.ActivityLog{}
	for rows.Next() {
		var l models.ActivityLog
		var userName sql.NullString
		err := rows.Scan(&l.ID, &l.UserID, &userName, &l.Action, &l.Details, &l.CreatedAt)
		if err != nil {
			respondWithError(w, http.StatusInternalServerError, "Failed to scan activity log")
			return
		}
		if userName.Valid {
			l.UserName = &userName.String
		}
		logs = append(logs, l)
	}

	respondWithJSON(w, http.StatusOK, logs)
}

// --- PDF EXPORT HANDLER ---

func (h *Handler) ExportPDF(w http.ResponseWriter, r *http.Request) {
	claims, err := GetUserFromContext(r.Context())
	if err != nil {
		respondWithError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	// Log activity
	h.logActivity(&claims.UserID, "EXPORT_PDF", "Exported maintenance requests report as PDF")

	statusQuery := r.URL.Query().Get("status")
	categoryQuery := r.URL.Query().Get("category_id")
	searchQuery := r.URL.Query().Get("search")

	query := `
		SELECT r.id, r.title, u.name as reporter_name, r.status, r.priority, r.location, r.created_at
		FROM requests r
		LEFT JOIN users u ON r.reporter_id = u.id
		WHERE 1=1
	`
	args := []interface{}{}
	argCount := 1

	if statusQuery != "" {
		query += fmt.Sprintf(" AND r.status = $%d", argCount)
		args = append(args, statusQuery)
		argCount++
	}

	if categoryQuery != "" {
		catID, err := strconv.Atoi(categoryQuery)
		if err == nil {
			query += fmt.Sprintf(" AND r.category_id = $%d", argCount)
			args = append(args, catID)
			argCount++
		}
	}

	if searchQuery != "" {
		query += fmt.Sprintf(" AND (r.title ILIKE $%d OR r.description ILIKE $%d OR r.location ILIKE $%d)", argCount, argCount, argCount)
		args = append(args, "%"+searchQuery+"%")
		argCount++
	}

	query += " ORDER BY r.created_at DESC"

	rows, err := h.DB.Query(query, args...)
	if err != nil {
		respondWithError(w, http.StatusInternalServerError, "Failed to query requests")
		return
	}
	defer rows.Close()

	pdf := gofpdf.New("L", "mm", "A4", "")
	pdf.AddPage()
	pdf.SetFont("Arial", "B", 16)
	pdf.Cell(40, 10, "MIVA Maintenance System - Request Report")
	pdf.Ln(12)

	// Table Header
	pdf.SetFont("Arial", "B", 12)
	pdf.CellFormat(15, 10, "ID", "1", 0, "", false, 0, "")
	pdf.CellFormat(70, 10, "Title", "1", 0, "", false, 0, "")
	pdf.CellFormat(40, 10, "Reporter", "1", 0, "", false, 0, "")
	pdf.CellFormat(30, 10, "Status", "1", 0, "", false, 0, "")
	pdf.CellFormat(25, 10, "Priority", "1", 0, "", false, 0, "")
	pdf.CellFormat(50, 10, "Location", "1", 0, "", false, 0, "")
	pdf.CellFormat(40, 10, "Date", "1", 0, "", false, 0, "")
	pdf.Ln(-1)

	// Table Body
	pdf.SetFont("Arial", "", 10)
	for rows.Next() {
		var id int
		var title, reporterName, status, priority, location string
		var createdAt time.Time
		err := rows.Scan(&id, &title, &reporterName, &status, &priority, &location, &createdAt)
		if err != nil {
			respondWithError(w, http.StatusInternalServerError, "Failed to scan request")
			return
		}

		pdf.CellFormat(15, 8, strconv.Itoa(id), "1", 0, "", false, 0, "")
		pdf.CellFormat(70, 8, title, "1", 0, "", false, 0, "")
		pdf.CellFormat(40, 8, reporterName, "1", 0, "", false, 0, "")
		pdf.CellFormat(30, 8, status, "1", 0, "", false, 0, "")
		pdf.CellFormat(25, 8, priority, "1", 0, "", false, 0, "")
		pdf.CellFormat(50, 8, location, "1", 0, "", false, 0, "")
		pdf.CellFormat(40, 8, createdAt.Format("2006-01-02 15:04"), "1", 0, "", false, 0, "")
		pdf.Ln(-1)
	}

	w.Header().Set("Content-Type", "application/pdf")
	w.Header().Set("Content-Disposition", "attachment; filename=maintenance_report.pdf")
	err = pdf.Output(w)
	if err != nil {
		respondWithError(w, http.StatusInternalServerError, "Failed to generate PDF")
	}
}
