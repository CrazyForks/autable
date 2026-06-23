package backup

import (
	"context"
	"os"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

type S3Uploader struct {
	bucket string
	client *s3.Client
}

func NewS3Uploader(ctx context.Context, options S3Options) (*S3Uploader, error) {
	region := options.Region
	if region == "" {
		region = "us-east-1"
	}
	loadOptions := []func(*awsconfig.LoadOptions) error{
		awsconfig.WithRegion(region),
	}
	if options.AccessKeyID != "" || options.SecretAccessKey != "" {
		loadOptions = append(loadOptions, awsconfig.WithCredentialsProvider(
			credentials.NewStaticCredentialsProvider(options.AccessKeyID, options.SecretAccessKey, ""),
		))
	}
	cfg, err := awsconfig.LoadDefaultConfig(ctx, loadOptions...)
	if err != nil {
		return nil, err
	}
	client := s3.NewFromConfig(cfg, func(clientOptions *s3.Options) {
		clientOptions.UsePathStyle = options.ForcePathStyle
		if options.Endpoint != "" {
			clientOptions.BaseEndpoint = aws.String(options.Endpoint)
		}
	})
	return &S3Uploader{bucket: options.Bucket, client: client}, nil
}

func (uploader *S3Uploader) Upload(ctx context.Context, path string, key string) error {
	file, err := os.Open(path)
	if err != nil {
		return err
	}
	defer file.Close()
	info, err := file.Stat()
	if err != nil {
		return err
	}
	_, err = uploader.client.PutObject(ctx, &s3.PutObjectInput{
		Bucket:        aws.String(uploader.bucket),
		Key:           aws.String(key),
		Body:          file,
		ContentLength: aws.Int64(info.Size()),
		ContentType:   aws.String("application/gzip"),
	})
	return err
}
