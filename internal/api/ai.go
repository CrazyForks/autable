package api

import (
	"bytes"
	"context"
	_ "embed"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"autable/internal/permission"
	"autable/internal/systemdb"

	"gopkg.in/yaml.v3"
)

//go:embed ai_reference.md
var autableAIReference string

type aiClient interface {
	AuthStatus(context.Context) (aiAuthStatusResponse, error)
	StartAuth(context.Context) (aiAuthStartResponse, error)
	Options(context.Context) (aiOptionsResponse, error)
	SuggestScript(context.Context, aiWorkerSuggestRequest) (aiSuggestScriptResponse, error)
}

type aiHTTPClient struct {
	baseURL string
	client  *http.Client
}

type aiAuthStatusResponse struct {
	Authenticated bool   `json:"authenticated"`
	Account       string `json:"account,omitempty"`
	Message       string `json:"message,omitempty"`
}

type aiAuthStartResponse struct {
	Type            string `json:"type"`
	LoginID         string `json:"login_id,omitempty"`
	VerificationURL string `json:"verification_url,omitempty"`
	UserCode        string `json:"user_code,omitempty"`
	AuthURL         string `json:"auth_url,omitempty"`
	Message         string `json:"message,omitempty"`
}

type aiReasoningEffortOption struct {
	ReasoningEffort string `json:"reasoning_effort"`
	Description     string `json:"description,omitempty"`
}

type aiModelOption struct {
	ID                        string                    `json:"id"`
	Model                     string                    `json:"model,omitempty"`
	DisplayName               string                    `json:"display_name"`
	Description               string                    `json:"description,omitempty"`
	SupportedReasoningEfforts []aiReasoningEffortOption `json:"supported_reasoning_efforts,omitempty"`
	DefaultReasoningEffort    string                    `json:"default_reasoning_effort,omitempty"`
	IsDefault                 bool                      `json:"is_default,omitempty"`
}

type aiOptionsResponse struct {
	Models []aiModelOption `json:"models"`
}

type aiSuggestScriptRequest struct {
	Kind            string `json:"kind"`
	ResourceID      int64  `json:"resource_id"`
	Instruction     string `json:"instruction"`
	Script          string `json:"script"`
	Language        string `json:"language,omitempty"`
	Model           string `json:"model,omitempty"`
	ReasoningEffort string `json:"reasoning_effort,omitempty"`
}

type aiSuggestScriptResponse struct {
	Content     string   `json:"content"`
	Summary     string   `json:"summary,omitempty"`
	Diagnostics []string `json:"diagnostics,omitempty"`
}

type aiWorkerSuggestRequest struct {
	Kind            string          `json:"kind"`
	ResourceID      int64           `json:"resource_id"`
	DatabaseName    string          `json:"database_name"`
	Name            string          `json:"name"`
	FilePath        string          `json:"file_path,omitempty"`
	RepositoryPath  string          `json:"repository_path,omitempty"`
	Instruction     string          `json:"instruction"`
	Script          string          `json:"script"`
	Language        string          `json:"language,omitempty"`
	Model           string          `json:"model,omitempty"`
	ReasoningEffort string          `json:"reasoning_effort,omitempty"`
	MetadataYAML    string          `json:"metadata_yaml"`
	WorkflowDocs    []aiWorkflowDoc `json:"workflow_docs,omitempty"`
	AutableDocs     []aiContextDoc  `json:"autable_docs,omitempty"`
	RelatedFiles    []aiContextFile `json:"related_files,omitempty"`
}

type aiWorkflowDoc struct {
	Type          string            `json:"type"`
	DisplayName   string            `json:"display_name"`
	Description   string            `json:"description,omitempty"`
	Documentation map[string]string `json:"documentation,omitempty"`
}

type aiContextDoc struct {
	Path    string `json:"path"`
	Content string `json:"content"`
}

type aiContextFile struct {
	Path    string `json:"path"`
	Content string `json:"content"`
}

func NewAIHTTPClient(baseURL string) aiClient {
	return &aiHTTPClient{
		baseURL: strings.TrimRight(strings.TrimSpace(baseURL), "/"),
		client:  &http.Client{Timeout: 2 * time.Minute},
	}
}

func (client *aiHTTPClient) AuthStatus(ctx context.Context) (aiAuthStatusResponse, error) {
	var response aiAuthStatusResponse
	err := client.do(ctx, http.MethodGet, "/auth/status", nil, &response)
	return response, err
}

func (client *aiHTTPClient) StartAuth(ctx context.Context) (aiAuthStartResponse, error) {
	var response aiAuthStartResponse
	err := client.do(ctx, http.MethodPost, "/auth/start", map[string]string{"type": "chatgptDeviceCode"}, &response)
	return response, err
}

func (client *aiHTTPClient) Options(ctx context.Context) (aiOptionsResponse, error) {
	var response aiOptionsResponse
	err := client.do(ctx, http.MethodGet, "/options", nil, &response)
	return response, err
}

func (client *aiHTTPClient) SuggestScript(ctx context.Context, request aiWorkerSuggestRequest) (aiSuggestScriptResponse, error) {
	var response aiSuggestScriptResponse
	err := client.do(ctx, http.MethodPost, "/suggest-script", request, &response)
	return response, err
}

func (client *aiHTTPClient) do(ctx context.Context, method, path string, requestBody any, responseBody any) error {
	if client.baseURL == "" {
		return errors.New("AI worker is not configured")
	}
	var body io.Reader
	if requestBody != nil {
		data, err := json.Marshal(requestBody)
		if err != nil {
			return err
		}
		body = bytes.NewReader(data)
	}
	request, err := http.NewRequestWithContext(ctx, method, client.baseURL+path, body)
	if err != nil {
		return err
	}
	if requestBody != nil {
		request.Header.Set("Content-Type", "application/json")
	}
	response, err := client.client.Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	data, err := io.ReadAll(io.LimitReader(response.Body, 8<<20))
	if err != nil {
		return err
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		var errorBody struct {
			Error string `json:"error"`
		}
		if err := json.Unmarshal(data, &errorBody); err == nil && errorBody.Error != "" {
			return errors.New(errorBody.Error)
		}
		return fmt.Errorf("AI worker request failed: %s", response.Status)
	}
	if responseBody == nil {
		return nil
	}
	return json.Unmarshal(data, responseBody)
}

func (server *Server) handleAIAuthStatus(w http.ResponseWriter, r *http.Request) {
	if _, ok := server.requireUserID(w, r); !ok {
		return
	}
	if server.ai == nil {
		writeError(w, http.StatusServiceUnavailable, errors.New("AI worker is not configured"))
		return
	}
	status, err := server.ai.AuthStatus(r.Context())
	if err != nil {
		writeError(w, http.StatusBadGateway, err)
		return
	}
	writeJSON(w, http.StatusOK, status)
}

func (server *Server) handleAIAuthStart(w http.ResponseWriter, r *http.Request) {
	if _, ok := server.requireUserID(w, r); !ok {
		return
	}
	if server.ai == nil {
		writeError(w, http.StatusServiceUnavailable, errors.New("AI worker is not configured"))
		return
	}
	response, err := server.ai.StartAuth(r.Context())
	if err != nil {
		writeError(w, http.StatusBadGateway, err)
		return
	}
	writeJSON(w, http.StatusOK, response)
}

func (server *Server) handleAIOptions(w http.ResponseWriter, r *http.Request) {
	if _, ok := server.requireUserID(w, r); !ok {
		return
	}
	if server.ai == nil {
		writeError(w, http.StatusServiceUnavailable, errors.New("AI worker is not configured"))
		return
	}
	response, err := server.ai.Options(r.Context())
	if err != nil {
		writeError(w, http.StatusBadGateway, err)
		return
	}
	writeJSON(w, http.StatusOK, response)
}

func (server *Server) handleAISuggestScript(w http.ResponseWriter, r *http.Request) {
	actorID, ok := server.requireUserID(w, r)
	if !ok {
		return
	}
	if server.ai == nil {
		writeError(w, http.StatusServiceUnavailable, errors.New("AI worker is not configured"))
		return
	}
	var request aiSuggestScriptRequest
	if err := readJSON(r, &request); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	if request.ResourceID == 0 {
		writeError(w, http.StatusBadRequest, errors.New("AI can only edit an existing workflow or form"))
		return
	}
	if strings.TrimSpace(request.Instruction) == "" {
		writeError(w, http.StatusBadRequest, errors.New("instruction is required"))
		return
	}
	workerRequest, ok := server.aiWorkerSuggestRequest(w, r, actorID, request)
	if !ok {
		return
	}
	response, err := server.ai.SuggestScript(r.Context(), workerRequest)
	if err != nil {
		writeError(w, http.StatusBadGateway, err)
		return
	}
	if strings.TrimSpace(response.Content) == "" {
		writeError(w, http.StatusBadGateway, errors.New("AI worker returned empty content"))
		return
	}
	writeJSON(w, http.StatusOK, response)
}

func (server *Server) aiWorkerSuggestRequest(w http.ResponseWriter, r *http.Request, actorID string, request aiSuggestScriptRequest) (aiWorkerSuggestRequest, bool) {
	switch request.Kind {
	case "workflow":
		if !server.requireResourceWrite(w, r, actorID, permission.ScopeWorkflow, request.ResourceID) {
			return aiWorkerSuggestRequest{}, false
		}
		workflow, err := server.system.Workflow(r.Context(), request.ResourceID)
		if err != nil {
			writeError(w, http.StatusNotFound, err)
			return aiWorkerSuggestRequest{}, false
		}
		workflow, err = server.workflowDefinitionWithFileScript(r.Context(), workflow)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return aiWorkerSuggestRequest{}, false
		}
		return server.buildAIWorkerSuggestRequest(r.Context(), request, workflow.DatabaseName, workflow.Name, workflowScriptPath(server.codeFiles, workflow)), true
	case "form":
		if !server.requireResourceWrite(w, r, actorID, permission.ScopeForm, request.ResourceID) {
			return aiWorkerSuggestRequest{}, false
		}
		form, err := server.system.Form(r.Context(), request.ResourceID)
		if err != nil {
			writeError(w, http.StatusNotFound, err)
			return aiWorkerSuggestRequest{}, false
		}
		form, err = server.formDefinitionWithFileScript(r.Context(), form)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return aiWorkerSuggestRequest{}, false
		}
		return server.buildAIWorkerSuggestRequest(r.Context(), request, form.DatabaseName, form.Name, formScriptPath(server.codeFiles, form)), true
	default:
		writeError(w, http.StatusBadRequest, fmt.Errorf("unsupported AI script kind %q", request.Kind))
		return aiWorkerSuggestRequest{}, false
	}
}

func (server *Server) buildAIWorkerSuggestRequest(ctx context.Context, request aiSuggestScriptRequest, databaseName, name, filePath string) aiWorkerSuggestRequest {
	return aiWorkerSuggestRequest{
		Kind:            request.Kind,
		ResourceID:      request.ResourceID,
		DatabaseName:    databaseName,
		Name:            name,
		FilePath:        filePath,
		RepositoryPath:  server.repositoryPath,
		Instruction:     request.Instruction,
		Script:          request.Script,
		Language:        request.Language,
		Model:           request.Model,
		ReasoningEffort: request.ReasoningEffort,
		MetadataYAML:    server.aiMetadataYAML(),
		WorkflowDocs:    server.aiWorkflowDocs(),
		AutableDocs: []aiContextDoc{{
			Path:    "autable-ai-reference.md",
			Content: autableAIReference,
		}},
		RelatedFiles: server.aiRelatedFiles(ctx, databaseName, request.Kind, request.ResourceID),
	}
}

func (server *Server) aiMetadataYAML() string {
	data, err := yaml.Marshal(server.catalogSnapshot())
	if err != nil {
		return ""
	}
	return string(data)
}

func (server *Server) aiWorkflowDocs() []aiWorkflowDoc {
	nodes := server.runner.NodeInfos()
	docs := make([]aiWorkflowDoc, 0, len(nodes))
	for _, node := range nodes {
		docs = append(docs, aiWorkflowDoc{
			Type:          node.Type,
			DisplayName:   node.DisplayName,
			Description:   node.Description,
			Documentation: node.Documentation,
		})
	}
	return docs
}

func (server *Server) aiRelatedFiles(ctx context.Context, databaseName, kind string, resourceID int64) []aiContextFile {
	files := []aiContextFile{}
	workflows, err := server.system.Workflows(ctx, databaseName)
	if err == nil {
		workflows, err = server.workflowDefinitionsWithFileScripts(ctx, workflows)
	}
	if err == nil {
		for _, workflow := range workflows {
			if kind == "workflow" && workflow.ID == resourceID {
				continue
			}
			files = append(files, aiContextFile{
				Path:    workflowScriptPath(server.codeFiles, workflow),
				Content: workflow.Script,
			})
		}
	}
	forms, err := server.system.Forms(ctx, databaseName)
	if err == nil {
		forms, err = server.formDefinitionsWithFileScripts(ctx, forms)
	}
	if err == nil {
		for _, form := range forms {
			if kind == "form" && form.ID == resourceID {
				continue
			}
			files = append(files, aiContextFile{
				Path:    formScriptPath(server.codeFiles, form),
				Content: form.Script,
			})
		}
	}
	return files
}

func workflowScriptPath(store codeFileStore, workflow systemdb.WorkflowDefinition) string {
	if store == nil {
		return workflow.DatabaseName + "/workflows/" + workflow.Name + ".js"
	}
	return store.WorkflowScriptPath(workflow)
}

func formScriptPath(store codeFileStore, form systemdb.FormDefinition) string {
	if store == nil {
		return form.DatabaseName + "/forms/" + form.Name + ".js"
	}
	return store.FormScriptPath(form)
}
