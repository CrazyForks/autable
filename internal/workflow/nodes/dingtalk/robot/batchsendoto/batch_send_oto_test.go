package batchsendoto

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"

	oauth2 "github.com/alibabacloud-go/dingtalk/oauth2_1_0"
	robot "github.com/alibabacloud-go/dingtalk/robot_1_0"
	util "github.com/alibabacloud-go/tea-utils/v2/service"

	"autable/internal/workflow"
)

type fakeDingTalkRobotBatchSendOTOClient struct {
	request  *robot.BatchSendOTORequest
	headers  *robot.BatchSendOTOHeaders
	response *robot.BatchSendOTOResponse
	err      error
}

func (client *fakeDingTalkRobotBatchSendOTOClient) BatchSendOTOWithOptions(request *robot.BatchSendOTORequest, headers *robot.BatchSendOTOHeaders, _ *util.RuntimeOptions) (*robot.BatchSendOTOResponse, error) {
	client.request = request
	client.headers = headers
	return client.response, client.err
}

type fakeDingTalkAccessTokenClient struct {
	appKey    string
	appSecret string
	response  *oauth2.GetAccessTokenResponse
	err       error
}

func (client *fakeDingTalkAccessTokenClient) GetAccessToken(request *oauth2.GetAccessTokenRequest) (*oauth2.GetAccessTokenResponse, error) {
	if request != nil {
		client.appKey = stringPtrValue(request.AppKey)
		client.appSecret = stringPtrValue(request.AppSecret)
	}
	return client.response, client.err
}

func TestDingTalkRobotBatchSendOTONodeCallsSDK(t *testing.T) {
	robotClient := &fakeDingTalkRobotBatchSendOTOClient{
		response: (&robot.BatchSendOTOResponse{}).
			SetStatusCode(200).
			SetBody((&robot.BatchSendOTOResponseBody{}).
				SetProcessQueryKey("query-1").
				SetFilteredStaffIdList(stringPtrs([]string{"filtered"})).
				SetFlowControlledStaffIdList(stringPtrs([]string{"limited"})).
				SetInvalidStaffIdList(stringPtrs([]string{"invalid"}))),
	}
	accessTokenClient := &fakeDingTalkAccessTokenClient{
		response: (&oauth2.GetAccessTokenResponse{}).
			SetBody((&oauth2.GetAccessTokenResponseBody{}).SetAccessToken("dingtalk-token").SetExpireIn(7200)),
	}
	node := NewNodeForTest(robotClient, accessTokenClient)
	output, err := node.Run(context.Background(), map[string]any{
		"userIds":  []any{" user-a ", "user-b"},
		"msgKey":   "sampleMarkdown",
		"msgParam": map[string]any{"title": "Hello", "text": "Autable"},
	}, workflow.RuntimeInfo{
		Variables: map[string]string{"robot_code": "ding-robot"},
		Secrets:   map[string]string{"app_key": "app-key", "app_secret": "app-secret"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if accessTokenClient.appKey != "app-key" || accessTokenClient.appSecret != "app-secret" {
		t.Fatalf("unexpected app credentials: app_key=%q app_secret=%q", accessTokenClient.appKey, accessTokenClient.appSecret)
	}
	if robotClient.headers == nil || stringPtrValue(robotClient.headers.XAcsDingtalkAccessToken) != "dingtalk-token" {
		t.Fatalf("expected access token header, got %#v", robotClient.headers)
	}
	if robotClient.request == nil {
		t.Fatal("expected request")
	}
	if stringPtrValue(robotClient.request.RobotCode) != "ding-robot" {
		t.Fatalf("unexpected robot code: %#v", robotClient.request.RobotCode)
	}
	if stringPtrValue(robotClient.request.MsgKey) != "sampleMarkdown" {
		t.Fatalf("unexpected msg key: %#v", robotClient.request.MsgKey)
	}
	var msgParam map[string]any
	if err := json.Unmarshal([]byte(stringPtrValue(robotClient.request.MsgParam)), &msgParam); err != nil {
		t.Fatal(err)
	}
	if msgParam["title"] != "Hello" || msgParam["text"] != "Autable" {
		t.Fatalf("unexpected msg param: %#v", msgParam)
	}
	if len(robotClient.request.UserIds) != 2 || stringPtrValue(robotClient.request.UserIds[0]) != "user-a" || stringPtrValue(robotClient.request.UserIds[1]) != "user-b" {
		t.Fatalf("unexpected user ids: %#v", robotClient.request.UserIds)
	}
	if output["status_code"] != 200 || output["process_query_key"] != "query-1" {
		t.Fatalf("unexpected output metadata: %#v", output)
	}
	if output["filtered_staff_id_list"].([]string)[0] != "filtered" ||
		output["flow_controlled_staff_id_list"].([]string)[0] != "limited" ||
		output["invalid_staff_id_list"].([]string)[0] != "invalid" {
		t.Fatalf("unexpected output lists: %#v", output)
	}
	if outputContains(output, "dingtalk-token") || outputContains(output, "app-secret") {
		t.Fatalf("node output leaked secret values: %#v", output)
	}
}

func TestDingTalkRobotBatchSendOTONodeAllowsStringMsgParam(t *testing.T) {
	robotClient := &fakeDingTalkRobotBatchSendOTOClient{}
	accessTokenClient := &fakeDingTalkAccessTokenClient{
		response: (&oauth2.GetAccessTokenResponse{}).
			SetBody((&oauth2.GetAccessTokenResponseBody{}).SetAccessToken("dingtalk-token")),
	}
	node := NewNodeForTest(robotClient, accessTokenClient)
	_, err := node.Run(context.Background(), map[string]any{
		"userIds":  []string{"user-a"},
		"msgKey":   "sampleText",
		"msgParam": `{"content":"hello"}`,
	}, workflow.RuntimeInfo{
		Variables: map[string]string{"robot_code": "ding-robot"},
		Secrets:   map[string]string{"app_key": "app-key", "app_secret": "app-secret"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if stringPtrValue(robotClient.request.MsgParam) != `{"content":"hello"}` {
		t.Fatalf("unexpected msg param: %#v", robotClient.request.MsgParam)
	}
}

func TestDingTalkRobotBatchSendOTONodeRequiresInputs(t *testing.T) {
	node := NewNodeForTest(&fakeDingTalkRobotBatchSendOTOClient{}, &fakeDingTalkAccessTokenClient{})
	if _, err := node.Run(context.Background(), map[string]any{}, workflow.RuntimeInfo{}); err == nil {
		t.Fatal("expected missing app_key error")
	}
	if _, err := node.Run(context.Background(), map[string]any{}, workflow.RuntimeInfo{Secrets: map[string]string{"app_key": "key"}}); err == nil {
		t.Fatal("expected missing app_secret error")
	}
	if _, err := node.Run(context.Background(), map[string]any{}, workflow.RuntimeInfo{Secrets: map[string]string{"app_key": "key", "app_secret": "secret"}}); err == nil {
		t.Fatal("expected missing robot_code error")
	}
	baseInfo := workflow.RuntimeInfo{
		Variables: map[string]string{"robot_code": "ding-robot"},
		Secrets:   map[string]string{"app_key": "key", "app_secret": "secret"},
	}
	if _, err := node.Run(context.Background(), map[string]any{"msgKey": "sampleText", "msgParam": "{}"}, baseInfo); err == nil {
		t.Fatal("expected missing userIds error")
	}
	if _, err := node.Run(context.Background(), map[string]any{"userIds": []any{"user-a"}, "msgParam": "{}"}, baseInfo); err == nil {
		t.Fatal("expected missing msgKey error")
	}
	if _, err := node.Run(context.Background(), map[string]any{"userIds": []any{"user-a"}, "msgKey": "sampleText"}, baseInfo); err == nil {
		t.Fatal("expected missing msgParam error")
	}
	if _, err := node.Run(context.Background(), map[string]any{"userIds": []any{"user-a"}, "msgKey": "sampleText", "msgParam": []any{"bad"}}, baseInfo); err == nil {
		t.Fatal("expected invalid msgParam error")
	}
}

func TestDingTalkRobotBatchSendOTONodeReturnsSDKErrorsWithOutput(t *testing.T) {
	apiErr := errors.New("dingtalk failed")
	robotClient := &fakeDingTalkRobotBatchSendOTOClient{
		response: (&robot.BatchSendOTOResponse{}).SetStatusCode(429),
		err:      apiErr,
	}
	accessTokenClient := &fakeDingTalkAccessTokenClient{
		response: (&oauth2.GetAccessTokenResponse{}).
			SetBody((&oauth2.GetAccessTokenResponseBody{}).SetAccessToken("dingtalk-token")),
	}
	node := NewNodeForTest(robotClient, accessTokenClient)
	output, err := node.Run(context.Background(), map[string]any{
		"userIds":  []string{"user-a"},
		"msgKey":   "sampleText",
		"msgParam": "{}",
	}, workflow.RuntimeInfo{
		Variables: map[string]string{"robot_code": "ding-robot"},
		Secrets:   map[string]string{"app_key": "app-key", "app_secret": "app-secret"},
	})
	if !errors.Is(err, apiErr) || output["status_code"] != 429 {
		t.Fatalf("expected api error with status output, got output=%#v err=%v", output, err)
	}
}

func TestDingTalkRobotBatchSendOTONodeIsAvailableInNodeInfos(t *testing.T) {
	runner := workflow.NewRunner(nil, NewNodeForTest(&fakeDingTalkRobotBatchSendOTOClient{}, &fakeDingTalkAccessTokenClient{}))
	infos := runner.NodeInfos()
	if len(infos) != 1 || infos[0].Type != "dingtalk.robot.oto.batch_send" {
		t.Fatalf("expected dingtalk robot OTO node info, got %#v", infos)
	}
	if len(infos[0].Inputs) != 3 || infos[0].Inputs[0].Name != "userIds" || infos[0].Inputs[1].Name != "msgKey" || infos[0].Inputs[2].Name != "msgParam" {
		t.Fatalf("expected runtime input metadata, got %#v", infos[0].Inputs)
	}
	if len(infos[0].Variables) != 1 || infos[0].Variables[0].Name != "robot_code" {
		t.Fatalf("expected robot code variable metadata, got %#v", infos[0].Variables)
	}
	if len(infos[0].Secrets) != 2 || infos[0].Secrets[0].Name != "app_key" || infos[0].Secrets[1].Name != "app_secret" {
		t.Fatalf("expected app credential secret metadata, got %#v", infos[0].Secrets)
	}
	if infos[0].Documentation["en-US"] == "" || infos[0].Documentation["zh-CN"] == "" {
		t.Fatalf("expected embedded documentation, got %#v", infos[0].Documentation)
	}
}

func outputContains(value map[string]any, text string) bool {
	encoded, err := json.Marshal(value)
	if err != nil {
		return false
	}
	return strings.Contains(string(encoded), text)
}
