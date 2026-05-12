/*
 * Jenkins declarative pipeline for a Docker-based Jenkins setup.
 *
 * Intended layout: Jenkins (or agent) runs inside a Linux container on Docker Desktop
 * for Windows. Stages use `sh` inside that container. Mount the host Docker socket so
 * `docker build` uses the same engine as your desktop daemon.
 *
 * Requirements on the Jenkins side: Docker Pipeline plugin, and an agent that can run
 * Linux containers (default for Docker Desktop “Linux containers” mode).
 */

pipeline {
    agent {
        docker {
            image 'python:3.12-bookworm'
            // Talk to the host Docker API (bind path is the in-VM path Linux sees).
            args '-v /var/run/docker.sock:/var/run/docker.sock -u root'
        }
    }

    environment {
        PIP_DISABLE_PIP_VERSION_CHECK = '1'
        // Allow system-wide installs in the ephemeral agent image (no venv).
        PIP_BREAK_SYSTEM_PACKAGES = '1'
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Install Dependencies') {
            steps {
                sh '''
                    python -m pip install --upgrade pip
                    python -m pip install -r requirements.txt
                '''
            }
        }

        stage('Run Tests') {
            steps {
                sh 'python -m pytest -q'
            }
        }

        stage('Docker Build') {
            when {
                expression { return fileExists('Dockerfile') }
            }
            steps {
                sh '''
                    set -eu
                    if ! command -v docker >/dev/null 2>&1; then
                        apt-get update -qq
                        DEBIAN_FRONTEND=noninteractive apt-get install -y -qq docker.io
                    fi
                    docker build -t server-health-checker:${BUILD_NUMBER} .
                '''
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
