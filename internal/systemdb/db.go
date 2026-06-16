package systemdb

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"codetable/internal/auth"
	"codetable/internal/permission"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type DB struct {
	orm *gorm.DB
}

type WorkflowDefinition struct {
	ID        int64
	Name      string
	Script    string
	Secrets   map[string]string
	Variables map[string]string
	CreatedAt time.Time
	UpdatedAt time.Time
}

type FormDefinition struct {
	ID        int64
	Name      string
	Script    string
	CreatedAt time.Time
	UpdatedAt time.Time
}

type userModel struct {
	ID           string `gorm:"primaryKey"`
	Email        string `gorm:"uniqueIndex;not null"`
	Provider     string `gorm:"not null"`
	ProviderName string `gorm:"not null"`
	Subject      string `gorm:"not null"`
	PasswordHash []byte
	CreatedAt    time.Time
	UpdatedAt    time.Time
}

type permissionGrantModel struct {
	ID        int64            `gorm:"primaryKey;autoIncrement"`
	SubjectID string           `gorm:"uniqueIndex:idx_permission_target;not null"`
	Scope     permission.Scope `gorm:"uniqueIndex:idx_permission_target;not null"`
	Resource  string           `gorm:"uniqueIndex:idx_permission_target;not null"`
	Field     string           `gorm:"uniqueIndex:idx_permission_target;not null;default:''"`
	Level     permission.Level `gorm:"not null"`
}

type workflowModel struct {
	ID            int64  `gorm:"primaryKey;autoIncrement"`
	Name          string `gorm:"uniqueIndex;not null"`
	Script        string `gorm:"not null"`
	SecretsJSON   string `gorm:"not null"`
	VariablesJSON string `gorm:"not null"`
	CreatedAt     time.Time
	UpdatedAt     time.Time
}

type formModel struct {
	ID        int64  `gorm:"primaryKey;autoIncrement"`
	Name      string `gorm:"uniqueIndex;not null"`
	Script    string `gorm:"not null"`
	CreatedAt time.Time
	UpdatedAt time.Time
}

func Open(ctx context.Context, path string) (*DB, error) {
	orm, err := gorm.Open(sqlite.Open(path), &gorm.Config{})
	if err != nil {
		return nil, err
	}
	db := &DB{orm: orm.WithContext(ctx)}
	if err := db.Migrate(ctx); err != nil {
		_ = db.Close()
		return nil, err
	}
	return db, nil
}

func (db *DB) Close() error {
	handle, err := db.orm.DB()
	if err != nil {
		return err
	}
	return handle.Close()
}

func (db *DB) Migrate(ctx context.Context) error {
	return db.orm.WithContext(ctx).AutoMigrate(
		&userModel{},
		&permissionGrantModel{},
		&workflowModel{},
		&formModel{},
	)
}

func (db *DB) UpsertUserByEmail(ctx context.Context, user auth.User) (auth.User, error) {
	if user.Email == "" {
		return auth.User{}, errors.New("email is required")
	}

	var existing userModel
	err := db.orm.WithContext(ctx).Where(&userModel{Email: user.Email}).First(&existing).Error
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return auth.User{}, err
	}
	if err == nil {
		user.ID = existing.ID
	}

	model := userToModel(user)
	err = db.orm.WithContext(ctx).Clauses(clause.OnConflict{
		Columns: []clause.Column{{Name: "email"}},
		DoUpdates: clause.AssignmentColumns([]string{
			"provider",
			"provider_name",
			"subject",
			"password_hash",
			"updated_at",
		}),
	}).Create(&model).Error
	if err != nil {
		return auth.User{}, err
	}
	return modelToUser(model), nil
}

func (db *DB) UserByEmail(ctx context.Context, email string) (auth.User, error) {
	normalized, err := auth.NormalizeEmail(email)
	if err != nil {
		return auth.User{}, err
	}
	var model userModel
	if err := db.orm.WithContext(ctx).Where(&userModel{Email: normalized}).First(&model).Error; err != nil {
		return auth.User{}, err
	}
	return modelToUser(model), nil
}

func (db *DB) SaveGrant(ctx context.Context, grant permission.Grant) error {
	model := grantToModel(grant)
	return db.orm.WithContext(ctx).Clauses(clause.OnConflict{
		Columns: []clause.Column{
			{Name: "subject_id"},
			{Name: "scope"},
			{Name: "resource"},
			{Name: "field"},
		},
		DoUpdates: clause.AssignmentColumns([]string{"level"}),
	}).Create(&model).Error
}

func (db *DB) GrantsForSubject(ctx context.Context, subjectID string) (permission.Set, error) {
	var models []permissionGrantModel
	err := db.orm.WithContext(ctx).
		Where(&permissionGrantModel{SubjectID: subjectID}).
		Order(clause.OrderByColumn{Column: clause.Column{Name: "resource"}}).
		Order(clause.OrderByColumn{Column: clause.Column{Name: "field"}}).
		Find(&models).Error
	if err != nil {
		return permission.Set{}, err
	}

	grants := make([]permission.Grant, 0, len(models))
	for _, model := range models {
		grants = append(grants, modelToGrant(model))
	}
	return permission.New(grants...), nil
}

func (db *DB) SaveWorkflow(ctx context.Context, workflow WorkflowDefinition) (WorkflowDefinition, error) {
	model, err := workflowToModel(workflow)
	if err != nil {
		return WorkflowDefinition{}, err
	}
	if workflow.ID == 0 {
		if err := db.orm.WithContext(ctx).Create(&model).Error; err != nil {
			return WorkflowDefinition{}, err
		}
		return modelToWorkflow(model)
	}
	if err := db.orm.WithContext(ctx).Save(&model).Error; err != nil {
		return WorkflowDefinition{}, err
	}
	return modelToWorkflow(model)
}

func (db *DB) Workflow(ctx context.Context, id int64) (WorkflowDefinition, error) {
	var model workflowModel
	if err := db.orm.WithContext(ctx).First(&model, id).Error; err != nil {
		return WorkflowDefinition{}, err
	}
	return modelToWorkflow(model)
}

func (db *DB) SaveForm(ctx context.Context, form FormDefinition) (FormDefinition, error) {
	model := formToModel(form)
	if form.ID == 0 {
		if err := db.orm.WithContext(ctx).Create(&model).Error; err != nil {
			return FormDefinition{}, err
		}
		return modelToForm(model), nil
	}
	if err := db.orm.WithContext(ctx).Save(&model).Error; err != nil {
		return FormDefinition{}, err
	}
	return modelToForm(model), nil
}

func userToModel(user auth.User) userModel {
	return userModel{
		ID:           user.ID,
		Email:        user.Email,
		Provider:     string(user.Provider),
		ProviderName: user.ProviderName,
		Subject:      user.Subject,
		PasswordHash: user.PasswordHash,
	}
}

func modelToUser(model userModel) auth.User {
	return auth.User{
		ID:           model.ID,
		Email:        model.Email,
		Provider:     auth.Provider(model.Provider),
		ProviderName: model.ProviderName,
		Subject:      model.Subject,
		PasswordHash: model.PasswordHash,
	}
}

func grantToModel(grant permission.Grant) permissionGrantModel {
	return permissionGrantModel{
		SubjectID: grant.SubjectID,
		Scope:     grant.Scope,
		Resource:  grant.Resource,
		Field:     grant.Field,
		Level:     grant.Level,
	}
}

func modelToGrant(model permissionGrantModel) permission.Grant {
	return permission.Grant{
		SubjectID: model.SubjectID,
		Scope:     model.Scope,
		Resource:  model.Resource,
		Field:     model.Field,
		Level:     model.Level,
	}
}

func workflowToModel(workflow WorkflowDefinition) (workflowModel, error) {
	secrets, err := json.Marshal(emptyStringMap(workflow.Secrets))
	if err != nil {
		return workflowModel{}, err
	}
	variables, err := json.Marshal(emptyStringMap(workflow.Variables))
	if err != nil {
		return workflowModel{}, err
	}
	return workflowModel{
		ID:            workflow.ID,
		Name:          workflow.Name,
		Script:        workflow.Script,
		SecretsJSON:   string(secrets),
		VariablesJSON: string(variables),
		CreatedAt:     workflow.CreatedAt,
		UpdatedAt:     workflow.UpdatedAt,
	}, nil
}

func modelToWorkflow(model workflowModel) (WorkflowDefinition, error) {
	workflow := WorkflowDefinition{
		ID:        model.ID,
		Name:      model.Name,
		Script:    model.Script,
		CreatedAt: model.CreatedAt,
		UpdatedAt: model.UpdatedAt,
	}
	if err := json.Unmarshal([]byte(model.SecretsJSON), &workflow.Secrets); err != nil {
		return WorkflowDefinition{}, err
	}
	if err := json.Unmarshal([]byte(model.VariablesJSON), &workflow.Variables); err != nil {
		return WorkflowDefinition{}, err
	}
	return workflow, nil
}

func formToModel(form FormDefinition) formModel {
	return formModel{
		ID:        form.ID,
		Name:      form.Name,
		Script:    form.Script,
		CreatedAt: form.CreatedAt,
		UpdatedAt: form.UpdatedAt,
	}
}

func modelToForm(model formModel) FormDefinition {
	return FormDefinition{
		ID:        model.ID,
		Name:      model.Name,
		Script:    model.Script,
		CreatedAt: model.CreatedAt,
		UpdatedAt: model.UpdatedAt,
	}
}

func emptyStringMap(values map[string]string) map[string]string {
	if values == nil {
		return map[string]string{}
	}
	return values
}
