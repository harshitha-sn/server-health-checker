pipeline {
    agent any

    options {
        timestamps()
    }

    environment {
        PYTHONUNBUFFERED = '1'
        PIP_DISABLE_PIP_VERSION_CHECK = '1'
        PIP_BREAK_SYSTEM_PACKAGES = '1'
        PYTHONPATH = "${WORKSPACE}"
        PATH = "${HOME}/.local/bin:/usr/local/bin:/usr/bin:/bin:${PATH}"
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
                    set -eu
                    cd "${WORKSPACE}"
                    command -v python3
                    python3 --version
                    python3 -m pip --version
                    python3 -m pip install --user -r requirements.txt
                '''
            }
        }

        stage('Run Tests') {
            steps {
                sh '''
                    set -eu
                    cd "${WORKSPACE}"
                    python3 -m pytest -v --tb=short --junitxml=test-results.xml
                '''
            }
        }

        stage('Docker Check') {
            steps {
                sh '''
                    set -eu
                    command -v docker
                    docker version
                '''
            }
        }

        stage('Docker Build') {
            when {
                expression { return fileExists('Dockerfile') }
            }
            steps {
                sh '''
                    set -eu
                    cd "${WORKSPACE}"
                    docker build -t server-health-checker:${BUILD_NUMBER} .
                '''
            }
        }
    }

    post {
        always {
            junit allowEmptyResults: true, testResults: 'test-results.xml'
        }
        success {
            echo 'Pipeline completed successfully.'
        }
        failure {
            echo 'Pipeline failed — see stage logs above.'
        }
        unstable {
            echo 'Pipeline is unstable.'
        }
    }
}
