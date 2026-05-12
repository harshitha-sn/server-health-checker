/*
 * Declarative pipeline: top-level `agent any` (typical Jenkins worker / controller executor).
 * Install Dependencies and Run Tests run inside `python:3.12` containers (Docker Pipeline plugin).
 * Docker Build runs on the host agent so `docker` can build the project image.
 *
 * Jenkins-in-Docker: mount the host Docker socket into the Jenkins agent container and
 * install the Docker CLI there so `docker build` and per-stage `docker { ... }` work.
 *
 * Note: each `docker { image ... }` stage starts a new container, so Run Tests repeats
 * `pip install` before `pytest` so dependencies exist in that container.
 */

pipeline {
    agent any

    environment {
        PIP_DISABLE_PIP_VERSION_CHECK = '1'
        PIP_BREAK_SYSTEM_PACKAGES = '1'
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Install Dependencies') {
            agent {
                docker {
                    image 'python:3.12'
                }
            }
            steps {
                sh 'pip install -r requirements.txt'
            }
        }

        stage('Run Tests') {
            agent {
                docker {
                    image 'python:3.12'
                }
            }
            steps {
                sh '''
                    pip install -r requirements.txt
                    pytest
                '''
            }
        }

        stage('Docker Build') {
            when {
                expression { return fileExists('Dockerfile') }
            }
            steps {
                sh 'docker build -t server-health-checker:${BUILD_NUMBER} .'
            }
        }
    }

    post {
        success {
            echo 'Pipeline completed successfully.'
        }
        failure {
            echo 'Pipeline failed — see logs for Install Dependencies, Run Tests, or Docker Build.'
        }
    }
}
