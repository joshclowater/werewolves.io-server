# Werewolves.io server

The server for the party game Werewolves.io built with [Node.js](https://nodejs.org/en/) and deployed using Amazon Web Services, running in Docker containers in [AWS Fargate](https://aws.amazon.com/fargate/).

Features:

- No EC2 instances. One of the goals of this application architecture is that it is very hands off, nothing to manage or update.
- Fully defined as infrastructure as code, using [AWS CloudFormation](https://aws.amazon.com/cloudformation/) to create all the application resources.
- CI/CD Pipeline using [AWS CodePipeline](https://aws.amazon.com/codepipeline/), so that you can just push to the Github and it will automatically deploy.
- Automated Docker container builds using [AWS CodeBuild](https://aws.amazon.com/codebuild/).

## Run it locally

To run the application on your local machine you need:

- `docker`
- `docker-compose`
- `make`

Execute the following command:

```
make start
```

The application will be available at `http://localhost:3000`

If you make changes to the server code, you can run:

```
make restart
```

This updates the application.
