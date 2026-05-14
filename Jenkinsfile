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
        // Must use env.PATH — bare ${PATH} in Groovy is null and strips system dirs (docker lives in /usr/bin).
        PATH = "${HOME}/.local/bin:/usr/local/bin:/usr/bin:/bin:${env.PATH}"
        DOCKER_HOST = 'unix:///var/run/docker.sock'
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
                    echo "=== Docker CI diagnostics ==="
                    echo "PATH=${PATH}"
                    echo "DOCKER_HOST=${DOCKER_HOST:-}"
                    test -S /var/run/docker.sock && echo "OK: /var/run/docker.sock is a socket" || echo "WARN: /var/run/docker.sock missing (mount host socket in compose)"

                    DOCKER_BIN=""
                    if command -v docker >/dev/null 2>&1; then
                      DOCKER_BIN=$(command -v docker)
                    elif [ -x /usr/bin/docker ]; then
                      DOCKER_BIN=/usr/bin/docker
                    elif [ -x /bin/docker ]; then
                      DOCKER_BIN=/bin/docker
                    fi

                    if [ -z "${DOCKER_BIN}" ]; then
                      echo ""
                      echo "ERROR: Docker CLI not found in this Jenkins container."
                      echo "Fix: rebuild the controller image (docker.io is in Dockerfile.jenkins):"
                      echo "  docker compose build --no-cache jenkins && docker compose up -d jenkins"
                      echo ""
                      ls -la /usr/bin/docker /bin/docker 2>/dev/null || true
                      exit 127
                    fi

                    echo "Using Docker CLI: ${DOCKER_BIN}"
                    "${DOCKER_BIN}" --version
                    "${DOCKER_BIN}" version
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
                    if command -v docker >/dev/null 2>&1; then
                      DOCKER_BIN=$(command -v docker)
                    elif [ -x /usr/bin/docker ]; then
                      DOCKER_BIN=/usr/bin/docker
                    else
                      echo "ERROR: Docker CLI not found — cannot build image."
                      exit 127
                    fi
                    "${DOCKER_BIN}" build -t server-health-checker:${BUILD_NUMBER} .
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
