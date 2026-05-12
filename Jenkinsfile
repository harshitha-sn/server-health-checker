/*
 * Declarative pipeline for a standard Jenkins installation (Linux agent, `sh`).
 * Expects `python`, `pip`, and `docker` on the agent PATH where those stages need them.
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
