package batchsendoto

import (
	"context"
	"encoding/json"
	"errors"
	"strings"

	openapi "github.com/alibabacloud-go/darabonba-openapi/v2/client"
	oauth2 "github.com/alibabacloud-go/dingtalk/oauth2_1_0"
	robot "github.com/alibabacloud-go/dingtalk/robot_1_0"
	util "github.com/alibabacloud-go/tea-utils/v2/service"

	"autable/internal/workflow"
)

type dingTalkRobotBatchSendOTOClient interface {
	BatchSendOTOWithOptions(request *robot.BatchSendOTORequest, headers *robot.BatchSendOTOHeaders, runtime *util.RuntimeOptions) (*robot.BatchSendOTOResponse, error)
}

type dingTalkAccessTokenClient interface {
	GetAccessToken(request *oauth2.GetAccessTokenRequest) (*oauth2.GetAccessTokenResponse, error)
}

type Node struct {
	robotClient       dingTalkRobotBatchSendOTOClient
	accessTokenClient dingTalkAccessTokenClient
	clientErr         error
}

func NewNode() Node {
	config := &openapi.Config{
		Protocol: stringPtr("HTTPS"),
	}
	robotClient, err := robot.NewClient(config)
	if err != nil {
		return Node{clientErr: err}
	}
	accessTokenClient, err := oauth2.NewClient(config)
	return Node{
		robotClient:       robotClient,
		accessTokenClient: accessTokenClient,
		clientErr:         err,
	}
}

func NewNodeForTest(robotClient dingTalkRobotBatchSendOTOClient, accessTokenClient dingTalkAccessTokenClient) Node {
	return Node{robotClient: robotClient, accessTokenClient: accessTokenClient}
}

func (node Node) Info() workflow.NodeInfo {
	return workflow.NodeInfo{
		Type:          "dingtalk.robot.oto.batch_send",
		DisplayName:   "DingTalk robot OTO message",
		Description:   "Sends robot one-to-one messages to DingTalk users through the DingTalk OpenAPI SDK.",
		Documentation: Documentation(),
		Inputs: []workflow.Port{
			{Name: "userIds", Type: "string[]", Description: "DingTalk user IDs to receive the message."},
			{Name: "msgKey", Type: "string", Description: "DingTalk robot message template key."},
			{Name: "msgParam", Type: "string|object", Description: "DingTalk robot message parameters as a JSON string or object."},
		},
		Outputs: []workflow.Port{
			{Name: "process_query_key", Type: "string"},
			{Name: "filtered_staff_id_list", Type: "string[]"},
			{Name: "flow_controlled_staff_id_list", Type: "string[]"},
			{Name: "invalid_staff_id_list", Type: "string[]"},
			{Name: "status_code", Type: "int"},
		},
		Variables: []workflow.Port{
			{Name: "robot_code", Type: "string", Description: "DingTalk robot code."},
		},
		Secrets: []workflow.Port{
			{Name: "app_key", Type: "string", Description: "DingTalk OpenAPI app key."},
			{Name: "app_secret", Type: "string", Description: "DingTalk OpenAPI app secret."},
		},
		Stateless: true,
	}
}

func (node Node) Run(ctx context.Context, input map[string]any, info workflow.RuntimeInfo) (map[string]any, error) {
	if node.clientErr != nil {
		return nil, node.clientErr
	}
	if node.robotClient == nil {
		return nil, errors.New("dingtalk robot client is not configured")
	}
	if node.accessTokenClient == nil {
		return nil, errors.New("dingtalk access token client is not configured")
	}

	appKey := strings.TrimSpace(info.Secrets["app_key"])
	if appKey == "" {
		return nil, errors.New("dingtalk app_key secret is required")
	}
	appSecret := strings.TrimSpace(info.Secrets["app_secret"])
	if appSecret == "" {
		return nil, errors.New("dingtalk app_secret secret is required")
	}
	robotCode := strings.TrimSpace(info.Variables["robot_code"])
	if robotCode == "" {
		return nil, errors.New("dingtalk robot_code is required")
	}

	request, err := batchSendOTORequest(input, robotCode)
	if err != nil {
		return nil, err
	}
	accessToken, err := node.accessToken(ctx, appKey, appSecret)
	if err != nil {
		return nil, err
	}
	response, err := node.robotClient.BatchSendOTOWithOptions(
		request,
		(&robot.BatchSendOTOHeaders{}).SetXAcsDingtalkAccessToken(accessToken),
		&util.RuntimeOptions{},
	)
	output := batchSendOTOOutput(response)
	if err != nil {
		return output, err
	}
	return output, nil
}

func (node Node) accessToken(ctx context.Context, appKey string, appSecret string) (string, error) {
	if err := ctx.Err(); err != nil {
		return "", err
	}
	response, err := node.accessTokenClient.GetAccessToken(
		(&oauth2.GetAccessTokenRequest{}).
			SetAppKey(appKey).
			SetAppSecret(appSecret),
	)
	if err != nil {
		return "", err
	}
	if err := ctx.Err(); err != nil {
		return "", err
	}
	if response == nil || response.Body == nil {
		return "", errors.New("dingtalk access token response is empty")
	}
	accessToken := strings.TrimSpace(stringPtrValue(response.Body.AccessToken))
	if accessToken == "" {
		return "", errors.New("dingtalk access token response is empty")
	}
	return accessToken, nil
}

func batchSendOTORequest(input map[string]any, robotCode string) (*robot.BatchSendOTORequest, error) {
	userIDs := stringSliceInput(input, "userIds")
	if len(userIDs) == 0 {
		return nil, errors.New("dingtalk userIds is required")
	}
	msgKey := strings.TrimSpace(stringInput(input, "msgKey"))
	if msgKey == "" {
		return nil, errors.New("dingtalk msgKey is required")
	}
	msgParam, err := msgParamInput(input["msgParam"])
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(msgParam) == "" {
		return nil, errors.New("dingtalk msgParam is required")
	}
	return (&robot.BatchSendOTORequest{}).
		SetRobotCode(robotCode).
		SetUserIds(stringPtrs(userIDs)).
		SetMsgKey(msgKey).
		SetMsgParam(msgParam), nil
}

func msgParamInput(value any) (string, error) {
	switch typed := value.(type) {
	case string:
		return typed, nil
	case map[string]any:
		encoded, err := json.Marshal(typed)
		if err != nil {
			return "", err
		}
		return string(encoded), nil
	default:
		if value == nil {
			return "", nil
		}
		return "", errors.New("dingtalk msgParam must be a string or object")
	}
}

func batchSendOTOOutput(response *robot.BatchSendOTOResponse) map[string]any {
	output := map[string]any{
		"process_query_key":             "",
		"filtered_staff_id_list":        []string{},
		"flow_controlled_staff_id_list": []string{},
		"invalid_staff_id_list":         []string{},
	}
	if response == nil {
		return output
	}
	if response.StatusCode != nil {
		output["status_code"] = int(*response.StatusCode)
	}
	if response.Body == nil {
		return output
	}
	output["process_query_key"] = stringPtrValue(response.Body.ProcessQueryKey)
	output["filtered_staff_id_list"] = stringPtrValues(response.Body.FilteredStaffIdList)
	output["flow_controlled_staff_id_list"] = stringPtrValues(response.Body.FlowControlledStaffIdList)
	output["invalid_staff_id_list"] = stringPtrValues(response.Body.InvalidStaffIdList)
	return output
}

func stringInput(input map[string]any, key string) string {
	if value, ok := input[key].(string); ok {
		return value
	}
	return ""
}

func stringSliceInput(input map[string]any, key string) []string {
	value, ok := input[key]
	if !ok {
		return nil
	}
	switch typed := value.(type) {
	case []string:
		return nonEmptyStrings(typed)
	case []any:
		values := make([]string, 0, len(typed))
		for _, item := range typed {
			if text, ok := item.(string); ok {
				values = append(values, text)
			}
		}
		return nonEmptyStrings(values)
	default:
		return nil
	}
}

func nonEmptyStrings(values []string) []string {
	filtered := make([]string, 0, len(values))
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value != "" {
			filtered = append(filtered, value)
		}
	}
	return filtered
}

func stringPtrs(values []string) []*string {
	pointers := make([]*string, 0, len(values))
	for _, value := range values {
		value := value
		pointers = append(pointers, &value)
	}
	return pointers
}

func stringPtrValues(values []*string) []string {
	output := make([]string, 0, len(values))
	for _, value := range values {
		if value != nil {
			output = append(output, *value)
		}
	}
	return output
}

func stringPtr(value string) *string {
	return &value
}

func stringPtrValue(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

var _ workflow.Node = Node{}
